import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionEndCause } from "@vetta/ecosystem-adapter";
import type { GreenfieldRuntimeSession, RuntimeSessionCatalog, SessionEvent } from "@vetta/runtime-core";
import { migrateLegacySessionToV2 } from "@vetta/runtime-storage/conversation";
import { normalizeCodingAgentLegacySessionEntry } from "../adapters/runtime-core/legacy-session-import-normalizer.js";
import { SessionManager } from "../core/session-manager/index.js";
import type {
	GreenfieldRuntimeComposition,
	GreenfieldRuntimeSessionOptions,
} from "./greenfield-runtime-composition.js";

export type CodingAgentGreenfieldSessionTransitionKind = "new" | "resume" | "fork";

export interface CodingAgentGreenfieldSessionTransition {
	readonly kind: CodingAgentGreenfieldSessionTransitionKind;
	readonly previous: GreenfieldRuntimeSession;
	readonly next?: GreenfieldRuntimeSession;
	readonly previousSessionPath: string | undefined;
	readonly targetSessionPath?: string;
	readonly entryId?: string;
}

export interface CodingAgentGreenfieldPreparedSessionBinding {
	commit(): Promise<void>;
	rollback(): Promise<void>;
	finalize(): Promise<void>;
}

export interface CodingAgentGreenfieldSessionTransitionDecision {
	readonly cancelled: boolean;
	readonly skipConversationRestore?: boolean;
}

export interface CodingAgentGreenfieldSessionTransitionLifecycle {
	before?(
		transition: CodingAgentGreenfieldSessionTransition,
	): Promise<CodingAgentGreenfieldSessionTransitionDecision | undefined>;
	prepare?(
		transition: CodingAgentGreenfieldSessionTransition & { readonly next: GreenfieldRuntimeSession },
	): Promise<CodingAgentGreenfieldPreparedSessionBinding | undefined>;
	after?(
		transition: CodingAgentGreenfieldSessionTransition & { readonly next: GreenfieldRuntimeSession },
	): Promise<void>;
}

export interface CodingAgentGreenfieldActiveSessionHostOptions {
	readonly runtime: GreenfieldRuntimeComposition;
	readonly initialSession: GreenfieldRuntimeSession;
	readonly sessionOptions: Omit<GreenfieldRuntimeSessionOptions, "sessionId" | "parentSessionPath" | "parentEntryId">;
	readonly conversationDir: string;
	readonly sessionCatalog: RuntimeSessionCatalog;
	readonly createSessionId: () => string;
	readonly resolveSessionId: (sessionPath: string) => string | undefined;
	readonly lifecycle?: CodingAgentGreenfieldSessionTransitionLifecycle;
}

/**
 * Coding Agent Greenfield 的活动 Session 事务宿主。
 *
 * Backend 继续拥有具体 Session；本类只拥有“当前活动者”、稳定事件订阅和切换事务。
 * 目标 Session、宿主 Binding 与 after 事件全部成功后才释放旧 Session；失败时恢复旧
 * Session，并删除由本次 new/fork 创建的会话产物。
 */
export class CodingAgentGreenfieldActiveSessionHost {
	private activeSession: GreenfieldRuntimeSession;
	private activeEventUnsubscribe: (() => void) | undefined;
	private readonly listeners = new Set<(event: SessionEvent) => void>();
	private transitionTail: Promise<void> = Promise.resolve();
	private suppressActiveEvents = false;
	private disposed = false;

	constructor(private readonly options: CodingAgentGreenfieldActiveSessionHostOptions) {
		this.activeSession = options.initialSession;
		this.bindActiveEvents();
	}

	readSession(): GreenfieldRuntimeSession {
		this.assertOpen();
		return this.activeSession;
	}

	subscribe(listener: (event: SessionEvent) => void): () => void {
		this.assertOpen();
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	waitForIdle(): Promise<void> {
		return this.runExclusive(() => waitForIdle(this.activeSession));
	}

	startActiveSessionOperation<T>(operation: (session: GreenfieldRuntimeSession) => Promise<T>): Promise<T> {
		let started: Promise<T> | undefined;
		return this.runExclusive(async () => {
			started = operation(this.activeSession);
		}).then(() => {
			if (!started) throw new Error("Greenfield active session operation did not start");
			return started;
		});
	}

	runActiveSessionMutation<T>(operation: (session: GreenfieldRuntimeSession) => Promise<T>): Promise<T> {
		return this.runExclusive(async () => {
			await waitForIdle(this.activeSession);
			return operation(this.activeSession);
		});
	}

	newSession(options?: {
		readonly parentSession?: string;
		readonly setup?: (sessionManager: SessionManager) => Promise<void>;
	}): Promise<{ cancelled: boolean }> {
		return this.runExclusive(async () => {
			const previous = this.activeSession;
			const transition = this.describe("new", previous);
			if ((await this.prepareTransition(transition)).cancelled) return { cancelled: true };
			await this.interruptActiveTurn(previous, "new_session");

			return this.withEndedSourceHooks(previous, "new_session", async () => {
				await this.options.runtime.quiesceSessionBackgroundCommands(previous.sessionId);
				const sessionId = this.options.createSessionId();
				const next = options?.setup
					? await this.createInitializedSession(sessionId, options.parentSession, options.setup)
					: await this.options.runtime.backend.create({
							...this.options.sessionOptions,
							sessionId,
							parentSessionPath: options?.parentSession,
						});
				this.options.runtime.sessionHooks.start(next.sessionId, "clear");
				const targetSessionPath = next.createCoreAssembly().lifecycle.sessionPath;
				await this.commitTransition({ ...transition, next, targetSessionPath }, { deleteTargetOnRollback: true });
				return { cancelled: false };
			});
		});
	}

	switchSession(sessionPath: string): Promise<{ cancelled: boolean }> {
		return this.runExclusive(async () => {
			const previous = this.activeSession;
			const previousPath = previous.createCoreAssembly().lifecycle.sessionPath;
			if (previousPath === sessionPath) return { cancelled: false };
			const transition = this.describe("resume", previous, { targetSessionPath: sessionPath });
			if ((await this.prepareTransition(transition)).cancelled) return { cancelled: true };
			await this.interruptActiveTurn(previous, "switch_session");

			return this.withEndedSourceHooks(previous, "switch_session", async () => {
				await this.options.runtime.quiesceSessionBackgroundCommands(previous.sessionId);
				const sessionId = this.options.resolveSessionId(sessionPath);
				if (!sessionId) throw new Error(`Greenfield session path is invalid: ${sessionPath}`);
				const next = await this.options.runtime.backend.resume({
					...this.options.sessionOptions,
					sessionId,
				});
				this.options.runtime.sessionHooks.start(next.sessionId, "resume");
				await this.commitTransition({ ...transition, next });
				return { cancelled: false };
			});
		});
	}

	fork(entryId: string): Promise<{ text: string; cancelled: boolean }> {
		return this.runExclusive(async () => {
			const previous = this.activeSession;
			await waitForIdle(previous);
			const transition = this.describe("fork", previous, { entryId });
			const decision = await this.prepareTransition(transition);
			if (decision.cancelled) return { text: "", cancelled: true };

			return this.withEndedSourceHooks(previous, "fork_session", async () => {
				await this.options.runtime.quiesceSessionBackgroundCommands(previous.sessionId);
				const fork = await previous.forkSession(entryId);
				const sessionId = this.options.resolveSessionId(fork.path);
				if (!sessionId) {
					await this.deleteCreatedTarget(fork.path);
					throw new Error(`Greenfield fork path is invalid: ${fork.path}`);
				}
				let next: GreenfieldRuntimeSession | undefined;
				try {
					next = await this.options.runtime.backend.resume({
						...this.options.sessionOptions,
						sessionId,
						parentSessionPath: transition.previousSessionPath,
						parentEntryId: entryId,
					});
					this.options.runtime.sessionHooks.start(next.sessionId, "clear");
					await next.createCoreAssembly().historyController.navigateForEdit(entryId);
					if (decision.skipConversationRestore) {
						await this.options.runtime.preserveSessionExecutionContext(previous.sessionId, sessionId);
					}
				} catch (error) {
					if (next) this.options.runtime.sessionHooks.discard(next.sessionId);
					await next?.dispose().catch(() => undefined);
					await this.deleteCreatedTarget(fork.path);
					throw error;
				}
				if (!next) throw new Error("Greenfield fork did not produce a target session");
				await this.commitTransition(
					{ ...transition, next, targetSessionPath: fork.path },
					{ deleteTargetOnRollback: true },
				);
				return { text: fork.text, cancelled: false };
			});
		});
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		await this.transitionTail;
		this.activeEventUnsubscribe?.();
		this.activeEventUnsubscribe = undefined;
		this.listeners.clear();
		await this.activeSession.dispose();
	}

	private describe(
		kind: CodingAgentGreenfieldSessionTransitionKind,
		previous: GreenfieldRuntimeSession,
		extra: Partial<Pick<CodingAgentGreenfieldSessionTransition, "targetSessionPath" | "entryId">> = {},
	): CodingAgentGreenfieldSessionTransition {
		return {
			kind,
			previous,
			previousSessionPath: previous.createCoreAssembly().lifecycle.sessionPath,
			...extra,
		};
	}

	private async prepareTransition(
		transition: CodingAgentGreenfieldSessionTransition,
	): Promise<CodingAgentGreenfieldSessionTransitionDecision> {
		return (await this.options.lifecycle?.before?.(transition)) ?? { cancelled: false };
	}

	private async commitTransition(
		transition: CodingAgentGreenfieldSessionTransition & { readonly next: GreenfieldRuntimeSession },
		options: { readonly deleteTargetOnRollback?: boolean } = {},
	): Promise<void> {
		const previous = transition.previous;
		const next = transition.next;
		let prepared: CodingAgentGreenfieldPreparedSessionBinding | undefined;
		let activeReplaced = false;
		try {
			prepared = await this.options.lifecycle?.prepare?.(transition);
			this.replaceActiveSession(next);
			activeReplaced = true;
			await prepared?.commit();
			await this.options.lifecycle?.after?.(transition);
		} catch (error) {
			if (activeReplaced) this.replaceActiveSession(previous);
			await prepared?.rollback();
			this.options.runtime.sessionHooks.discard(next.sessionId);
			await next.dispose().catch(() => undefined);
			if (options.deleteTargetOnRollback && transition.targetSessionPath) {
				await this.deleteCreatedTarget(transition.targetSessionPath);
			}
			throw error;
		}

		const cleanup = await Promise.allSettled([prepared?.finalize(), previous.dispose()]);
		const cleanupErrors = cleanup
			.filter((result): result is PromiseRejectedResult => result.status === "rejected")
			.map(({ reason }) => reason);
		if (cleanupErrors.length > 0) {
			throw new AggregateError(cleanupErrors, "Greenfield session transition committed, but cleanup failed");
		}
	}

	private async withEndedSourceHooks<T>(
		previous: GreenfieldRuntimeSession,
		cause: SessionEndCause,
		operation: () => Promise<T>,
	): Promise<T> {
		await this.options.runtime.sessionHooks.end(previous.sessionId, cause);
		try {
			return await operation();
		} catch (error) {
			if (this.activeSession === previous) {
				this.options.runtime.sessionHooks.start(previous.sessionId, "resume");
			}
			throw error;
		}
	}

	private replaceActiveSession(session: GreenfieldRuntimeSession): void {
		this.activeEventUnsubscribe?.();
		this.activeSession = session;
		this.bindActiveEvents();
	}

	private bindActiveEvents(): void {
		this.activeEventUnsubscribe = this.activeSession.subscribe((event) => {
			if (this.suppressActiveEvents) return;
			for (const listener of this.listeners) {
				try {
					listener(event);
				} catch (error) {
					console.warn("[GreenfieldActiveSessionHost] Event listener failed", error);
				}
			}
		});
	}

	private async interruptActiveTurn(session: GreenfieldRuntimeSession, reason: string): Promise<void> {
		if (!session.readState().isStreaming) return;
		this.suppressActiveEvents = true;
		try {
			await session.abort(reason);
			await waitForIdle(session);
		} finally {
			this.suppressActiveEvents = false;
		}
	}

	private async createInitializedSession(
		sessionId: string,
		parentSession: string | undefined,
		setup: (sessionManager: SessionManager) => Promise<void>,
	): Promise<GreenfieldRuntimeSession> {
		const temporaryDirectory = await mkdtemp(join(tmpdir(), "vetta-greenfield-session-setup-"));
		const sessionManager = SessionManager.create(
			this.options.sessionOptions.cwd ?? process.cwd(),
			temporaryDirectory,
			{ parentSession },
		);
		try {
			await setup(sessionManager);
			const sourcePath = sessionManager.getSessionFile();
			if (!sourcePath) throw new Error("Extension newSession setup did not create a persisted session");
			const header = sessionManager.getHeader();
			if (!header) throw new Error("Extension newSession setup did not retain a session header");
			const snapshot = [header, ...sessionManager.getEntries()].map((entry) => JSON.stringify(entry)).join("\n");
			await writeFile(sourcePath, `${snapshot}\n`, "utf8");
			sessionManager.close();
			await migrateLegacySessionToV2({
				sourcePath,
				targetRootDir: this.options.conversationDir,
				targetSessionId: sessionId,
				entryNormalizer: normalizeCodingAgentLegacySessionEntry,
			});
			try {
				return await this.options.runtime.backend.resume({
					...this.options.sessionOptions,
					sessionId,
					parentSessionPath: parentSession,
				});
			} catch (error) {
				await this.deleteCreatedTargetPathForSession(sessionId);
				throw error;
			}
		} finally {
			sessionManager.close();
			await rm(temporaryDirectory, { force: true, recursive: true });
		}
	}

	private async deleteCreatedTargetPathForSession(sessionId: string): Promise<void> {
		const targetPath = join(
			this.options.conversationDir,
			`${Buffer.from(sessionId, "utf8").toString("base64url")}.conversation.jsonl`,
		);
		await this.deleteCreatedTarget(targetPath);
	}

	private async deleteCreatedTarget(sessionPath: string): Promise<void> {
		if (await this.options.sessionCatalog.ownsSession(sessionPath)) {
			await this.options.sessionCatalog.deleteSessionArtifacts(sessionPath);
		}
	}

	private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
		this.assertOpen();
		const result = this.transitionTail.then(operation);
		this.transitionTail = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	private assertOpen(): void {
		if (this.disposed) throw new Error("Greenfield active session host is disposed");
	}
}

async function waitForIdle(session: GreenfieldRuntimeSession): Promise<void> {
	await new Promise<void>((resolve) => {
		let unsubscribe: (() => void) | undefined;
		let settled = false;
		const finish = (): void => {
			if (settled) return;
			settled = true;
			unsubscribe?.();
			resolve();
		};
		unsubscribe = session.subscribe((event) => {
			if (event.type !== "session.lifecycle") return;
			if (event.phase !== "agent_end" && event.phase !== "aborted") return;
			finish();
		});
		if (settled) unsubscribe();
		else if (!session.readState().isStreaming) finish();
	});
}
