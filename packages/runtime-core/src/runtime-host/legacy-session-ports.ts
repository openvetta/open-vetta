import type { Message } from "@vetta/ai";
import type { AgentSessionEvent } from "@vetta/coding-agent";
import type { HistoryEntry, SessionEvent } from "../contracts.js";
import { entriesToHistory } from "./history.js";
import type { RuntimeSession } from "./session-backend.js";
import { mapAgentSessionEvent } from "./session-events.js";
import type {
	RuntimeModelSelectionStrategy,
	RuntimeSessionCorePorts,
	RuntimeSessionEventStream,
	RuntimeSessionHistoryController,
	RuntimeSessionHistoryReader,
	RuntimeSessionIdentityLifecycle,
	RuntimeSessionModelController,
	RuntimeSessionModelView,
	RuntimeSessionState,
	RuntimeSessionStateReader,
	RuntimeSessionTurnControl,
	RuntimeTurnPrompt,
} from "./session-ports.js";

export class LegacyRuntimeSessionIdentityLifecycle implements RuntimeSessionIdentityLifecycle {
	constructor(private readonly session: RuntimeSession) {}

	get sessionId(): string {
		return this.session.sessionId;
	}

	get sessionPath(): string | undefined {
		return this.session.sessionFile;
	}

	async dispose(): Promise<void> {
		await this.session.dispose();
	}
}

export class LegacyRuntimeSessionTurnControl implements RuntimeSessionTurnControl {
	constructor(private readonly session: RuntimeSession) {}

	async prompt(request: RuntimeTurnPrompt): Promise<void> {
		await this.session.prompt(request.text, {
			images: request.images,
			streamingBehavior: request.streamingBehavior,
			promptRef: request.promptRef,
			attachments: request.attachments,
			source: "extension",
			metadata: request.metadata,
		});
	}

	async continue(): Promise<void> {
		await this.session.agent.continue();
	}

	async abort(): Promise<void> {
		await this.session.abort();
	}
}

/** 一个旧 Session 只建立一个底层订阅，映射一次后向多个 Port 订阅者扇出。 */
export class LegacyRuntimeSessionEventStream implements RuntimeSessionEventStream {
	private readonly listeners = new Set<(event: SessionEvent) => void>();
	private readonly currentTurnStartedAt = new Map<string, number>();
	private sourceUnsubscribe: (() => void) | undefined;

	constructor(private readonly session: RuntimeSession) {}

	subscribe(handler: (event: SessionEvent) => void): () => void {
		this.listeners.add(handler);
		this.ensureSourceSubscription();
		let subscribed = true;
		return () => {
			if (!subscribed) return;
			subscribed = false;
			this.listeners.delete(handler);
			if (this.listeners.size === 0) {
				this.sourceUnsubscribe?.();
				this.sourceUnsubscribe = undefined;
			}
		};
	}

	private ensureSourceSubscription(): void {
		if (this.sourceUnsubscribe) return;
		this.sourceUnsubscribe = this.session.subscribe((event: AgentSessionEvent) => {
			for (const mapped of mapAgentSessionEvent(this.session.sessionId, event, this.session, {
				currentTurnStartedAt: this.currentTurnStartedAt,
			})) {
				for (const listener of this.listeners) listener(mapped);
			}
		});
	}
}

export class LegacyRuntimeSessionStateReader implements RuntimeSessionStateReader {
	constructor(private readonly session: RuntimeSession) {}

	readState(): RuntimeSessionState {
		const contextUsage = this.session.getContextUsage();
		const header = this.session.sessionManager.getHeader();
		return {
			model: this.session.model,
			thinkingLevel: this.session.thinkingLevel,
			isStreaming: this.session.isStreaming,
			messageCount: this.session.messages.length,
			contextPercent: contextUsage?.percent ?? null,
			contextWindow: contextUsage?.contextWindow ?? 0,
			activeToolNames: this.session.getActiveToolNames(),
			parentSessionPath: header?.parentSession,
			parentEntryId: header?.parentEntryId,
		};
	}

	readMessages(): readonly Message[] {
		return this.session.messages.filter((message): message is Message => {
			return message.role === "user" || message.role === "assistant" || message.role === "toolResult";
		});
	}
}

export class LegacyRuntimeSessionHistoryReader implements RuntimeSessionHistoryReader {
	constructor(private readonly session: RuntimeSession) {}

	readHistory(): readonly HistoryEntry[] {
		const sessionManager = this.session.sessionManager;
		return entriesToHistory(this.session.getSessionBranch(), { allEntries: sessionManager.getEntries() });
	}
}

export class LegacyRuntimeSessionHistoryController implements RuntimeSessionHistoryController {
	constructor(private readonly session: RuntimeSession) {}

	async navigateForEdit(entryId: string): Promise<{ text: string; cancelled: boolean }> {
		this.assertCanMutate("Cannot edit message while the session is streaming");
		const entry = this.session.sessionManager.getEntry(entryId);
		if (!entry) {
			throw new Error(`Entry ${entryId} not found`);
		}
		const result = await this.session.navigateTree(entryId, { summarize: false });
		if (result.cancelled) {
			return { text: "", cancelled: true };
		}
		return { text: result.editorText ?? "", cancelled: false };
	}

	switchBranch(entryId: string): { leafId: string } {
		this.assertCanMutate("Cannot switch branch while the session is streaming");
		return this.session.switchBranch(entryId);
	}

	deleteMessage(entryId: string): { leafId: string | null } {
		this.assertCanMutate("Cannot delete a message while the session is streaming");
		return this.session.deleteMessage(entryId);
	}

	replaceLastUserMessage(entryId: string): { leafId: string | null } {
		this.assertCanMutate("Cannot replace a message while the session is streaming");
		const result = this.session.sessionManager.replaceLastUserMessage(entryId);
		this.session.agent.replaceMessages(this.session.sessionManager.buildSessionContext().messages);
		return result;
	}

	forkSession(entryId: string): { path: string; text: string } {
		this.assertCanMutate("Cannot fork while the session is streaming");
		return this.session.exportForkToNewFile(entryId);
	}

	setName(name: string): void {
		this.session.setSessionName(name);
	}

	private assertCanMutate(message: string): void {
		if (this.session.isStreaming || this.session.isBashRunning) {
			throw new Error(message);
		}
	}
}

export class LegacyRuntimeSessionModelController implements RuntimeSessionModelController {
	constructor(private readonly session: RuntimeSession) {}

	async selectModel(modelKey: string, strategy: RuntimeModelSelectionStrategy): Promise<void> {
		const [provider, ...rest] = modelKey.split("/");
		const modelId = rest.join("/");
		const registry = this.session.modelRegistry;
		const available = registry.getAvailable();
		const model =
			available.find((candidate) => candidate.provider === provider && candidate.id === modelId) ??
			registry.find(provider, modelId);
		if (!model) return;
		if (strategy === "if-changed") {
			const current = this.session.model;
			if (current?.provider === provider && current.id === modelId) return;
		}
		await this.session.setModel(model);
	}

	setThinkingLevel(level: Parameters<RuntimeSessionModelController["setThinkingLevel"]>[0]): void {
		this.session.setThinkingLevel(level);
	}

	async refreshAuth(token: string | undefined): Promise<void> {
		this.session.modelRegistry.setServerToken(token);
		await this.session.modelRegistry.loadRemoteModels();
	}
}

export class LegacyRuntimeSessionModelView implements RuntimeSessionModelView {
	constructor(private readonly session: RuntimeSession) {}

	readCurrentModel(): ReturnType<RuntimeSessionModelView["readCurrentModel"]> {
		return this.session.model;
	}

	refreshAvailableModels(): void {
		this.session.modelRegistry.refresh();
	}

	readAvailableModels(): ReturnType<RuntimeSessionModelView["readAvailableModels"]> {
		return [...this.session.modelRegistry.getAvailable()];
	}

	async resolveApiKey(model: Parameters<RuntimeSessionModelView["resolveApiKey"]>[0]): Promise<string | undefined> {
		return this.session.modelRegistry.getApiKey(model);
	}
}

export function createLegacyRuntimeSessionCorePorts(session: RuntimeSession): RuntimeSessionCorePorts {
	return {
		turnControl: new LegacyRuntimeSessionTurnControl(session),
		eventStream: new LegacyRuntimeSessionEventStream(session),
		stateReader: new LegacyRuntimeSessionStateReader(session),
	};
}
