import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GreenfieldRuntimeSession, RuntimeSessionCatalog, SessionEvent } from "@vetta/runtime-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	CodingAgentGreenfieldActiveSessionHost,
	type CodingAgentGreenfieldPreparedSessionBinding,
} from "../../src/composition/greenfield-active-session-transition-host.js";
import type { GreenfieldRuntimeComposition } from "../../src/composition/greenfield-runtime-composition.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	for (const directory of temporaryDirectories.splice(0).reverse()) {
		await rm(directory, { force: true, recursive: true });
	}
});

describe("CodingAgentGreenfieldActiveSessionHost", () => {
	it("switches the active session atomically and keeps external event subscriptions stable", async () => {
		const fixture = await createFixture();
		const next = createSession("next", fixture.sessionPath("next"));
		fixture.resume.mockResolvedValueOnce(next.session);
		const events: string[] = [];
		fixture.host.subscribe((event) => events.push(event.eventId));

		fixture.initial.emit(sessionEvent("old-event", "initial"));
		await expect(fixture.host.switchSession(fixture.sessionPath("next"))).resolves.toEqual({ cancelled: false });
		fixture.initial.emit(sessionEvent("stale-event", "initial"));
		next.emit(sessionEvent("next-event", "next"));

		expect(fixture.host.readSession()).toBe(next.session);
		expect(events).toEqual(["old-event", "next-event"]);
		expect(fixture.initial.dispose).toHaveBeenCalledOnce();
		expect(fixture.lifecycleOrder).toEqual([
			"before:resume",
			"prepare:next",
			"commit:next",
			"after:resume",
			"finalize:next",
		]);
	});

	it("rolls back the active session and prepared binding when after-transition fails", async () => {
		const fixture = await createFixture({ failAfter: true });
		const next = createSession("next", fixture.sessionPath("next"));
		fixture.resume.mockResolvedValueOnce(next.session);

		await expect(fixture.host.switchSession(fixture.sessionPath("next"))).rejects.toThrow("after failed");

		expect(fixture.host.readSession()).toBe(fixture.initial.session);
		expect(next.dispose).toHaveBeenCalledOnce();
		expect(fixture.initial.dispose).not.toHaveBeenCalled();
		expect(fixture.lifecycleOrder).toEqual([
			"before:resume",
			"prepare:next",
			"commit:next",
			"after:resume",
			"rollback:next",
		]);
	});

	it("keeps the committed session active when previous-session cleanup fails", async () => {
		const fixture = await createFixture({ failFinalize: true });
		const next = createSession("next", fixture.sessionPath("next"));
		fixture.resume.mockResolvedValueOnce(next.session);

		await expect(fixture.host.switchSession(fixture.sessionPath("next"))).rejects.toThrow(
			"transition committed, but cleanup failed",
		);

		expect(fixture.host.readSession()).toBe(next.session);
		expect(fixture.initial.dispose).toHaveBeenCalledOnce();
		expect(next.dispose).not.toHaveBeenCalled();
		expect(fixture.lifecycleOrder).toEqual([
			"before:resume",
			"prepare:next",
			"commit:next",
			"after:resume",
			"finalize:next",
		]);
	});

	it("runs Extension setup against a real persisted SessionManager and imports it before activation", async () => {
		const fixture = await createFixture();
		const next = createSession("created", fixture.sessionPath("created"));
		fixture.resume.mockResolvedValueOnce(next.session);
		let setupSessionFile: string | undefined;

		await expect(
			fixture.host.newSession({
				parentSession: fixture.initial.path,
				setup: async (sessionManager) => {
					expect(sessionManager.isPersisted()).toBe(true);
					setupSessionFile = sessionManager.getSessionFile();
					sessionManager.appendMessage({
						role: "user",
						content: [{ type: "text", text: "setup context" }],
						timestamp: 10,
					});
				},
			}),
		).resolves.toEqual({ cancelled: false });

		expect(setupSessionFile).toBeDefined();
		expect(fixture.resume).toHaveBeenCalledWith(
			expect.objectContaining({ sessionId: "created", parentSessionPath: fixture.initial.path }),
		);
		const imported = await readFile(fixture.sessionPath("created"), "utf8");
		expect(imported).toContain('"recordType":"conversation.import.seed"');
		expect(imported).toContain("setup context");
	});

	it("removes a created fork and restores the source session when rebinding fails", async () => {
		const fixture = await createFixture({ failPrepare: true });
		const fork = createSession("forked", fixture.sessionPath("forked"));
		await fixture.writeConversationPlaceholder("forked");
		fixture.initial.forkSession.mockResolvedValueOnce({ path: fork.path, text: "fork prompt" });
		fixture.resume.mockResolvedValueOnce(fork.session);

		await expect(fixture.host.fork("entry-1")).rejects.toThrow("prepare failed");

		expect(fork.navigateForEdit).toHaveBeenCalledWith("entry-1");
		expect(fixture.host.readSession()).toBe(fixture.initial.session);
		expect(fork.dispose).toHaveBeenCalledOnce();
		await expect(access(fork.path)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("preserves the source execution context when session_before_fork requests it", async () => {
		const fixture = await createFixture({ skipConversationRestore: true });
		const fork = createSession("forked", fixture.sessionPath("forked"));
		await fixture.writeConversationPlaceholder("forked");
		fixture.initial.forkSession.mockResolvedValueOnce({ path: fork.path, text: "fork prompt" });
		fixture.resume.mockResolvedValueOnce(fork.session);

		await expect(fixture.host.fork("entry-1")).resolves.toEqual({ text: "fork prompt", cancelled: false });

		expect(fork.navigateForEdit).toHaveBeenCalledWith("entry-1");
		expect(fixture.preserveSessionExecutionContext).toHaveBeenCalledWith("initial", "forked");
		expect(fixture.lifecycleOrder).toEqual([
			"before:fork",
			"preserve:initial:forked",
			"prepare:forked",
			"commit:forked",
			"after:fork",
			"finalize:forked",
		]);
	});
});

async function createFixture(
	options: {
		failAfter?: boolean;
		failFinalize?: boolean;
		failPrepare?: boolean;
		skipConversationRestore?: boolean;
	} = {},
) {
	const conversationDir = await mkdtemp(join(tmpdir(), "greenfield-active-session-host-"));
	temporaryDirectories.push(conversationDir);
	const initial = createSession("initial", sessionPath(conversationDir, "initial"));
	const create = vi.fn<(options: { sessionId: string }) => Promise<GreenfieldRuntimeSession>>();
	const resume = vi.fn<(options: { sessionId: string }) => Promise<GreenfieldRuntimeSession>>();
	const preserveSessionExecutionContext = vi.fn(async (sourceSessionId: string, targetSessionId: string) => {
		lifecycleOrder.push(`preserve:${sourceSessionId}:${targetSessionId}`);
	});
	const runtime = {
		backend: { create, resume },
		preserveSessionExecutionContext,
	} as unknown as GreenfieldRuntimeComposition;
	const catalog: RuntimeSessionCatalog = {
		ownsSession: async (path) => {
			try {
				await access(path);
				return true;
			} catch {
				return false;
			}
		},
		listProjects: async () => [],
		listSessions: async () => [],
		renameSession: async () => {},
		deleteSessionArtifacts: async (path) => rm(path, { force: true }),
	};
	const lifecycleOrder: string[] = [];
	const host = new CodingAgentGreenfieldActiveSessionHost({
		runtime,
		initialSession: initial.session,
		sessionOptions: { cwd: conversationDir },
		conversationDir,
		sessionCatalog: catalog,
		createSessionId: () => "created",
		resolveSessionId: (path) => {
			const encoded = path.match(/([^\\/]+)\.conversation\.jsonl$/)?.[1];
			return encoded ? Buffer.from(encoded, "base64url").toString("utf8") : undefined;
		},
		lifecycle: {
			before: async ({ kind }) => {
				lifecycleOrder.push(`before:${kind}`);
				return {
					cancelled: false,
					...(kind === "fork" && options.skipConversationRestore ? { skipConversationRestore: true } : {}),
				};
			},
			prepare: async ({ next }): Promise<CodingAgentGreenfieldPreparedSessionBinding> => {
				lifecycleOrder.push(`prepare:${next.sessionId}`);
				if (options.failPrepare) throw new Error("prepare failed");
				return {
					commit: async () => {
						lifecycleOrder.push(`commit:${next.sessionId}`);
					},
					rollback: async () => {
						lifecycleOrder.push(`rollback:${next.sessionId}`);
					},
					finalize: async () => {
						lifecycleOrder.push(`finalize:${next.sessionId}`);
						if (options.failFinalize) throw new Error("finalize failed");
					},
				};
			},
			after: async ({ kind }) => {
				lifecycleOrder.push(`after:${kind}`);
				if (options.failAfter) throw new Error("after failed");
			},
		},
	});
	return {
		host,
		initial,
		create,
		resume,
		preserveSessionExecutionContext,
		lifecycleOrder,
		sessionPath: (id: string) => sessionPath(conversationDir, id),
		writeConversationPlaceholder: async (id: string) => writeFile(sessionPath(conversationDir, id), "placeholder"),
	};
}

function createSession(id: string, path: string) {
	let listener: ((event: SessionEvent) => void) | undefined;
	const dispose = vi.fn(async () => {});
	const forkSession = vi.fn(async () => ({ path, text: "" }));
	const navigateForEdit = vi.fn(async () => ({ text: "", cancelled: false }));
	const session = {
		get sessionId() {
			return id;
		},
		readState: () => ({ isStreaming: false }),
		createCoreAssembly: () => ({
			historyController: { navigateForEdit },
			lifecycle: { sessionId: id, sessionPath: path, dispose },
		}),
		subscribe: (handler: (event: SessionEvent) => void) => {
			listener = handler;
			return () => {
				if (listener === handler) listener = undefined;
			};
		},
		forkSession,
		dispose,
	} as unknown as GreenfieldRuntimeSession;
	return {
		session,
		path,
		dispose,
		forkSession,
		navigateForEdit,
		emit(event: SessionEvent) {
			listener?.(event);
		},
	};
}

function sessionPath(root: string, id: string): string {
	return join(root, `${Buffer.from(id, "utf8").toString("base64url")}.conversation.jsonl`);
}

function sessionEvent(eventId: string, sessionId: string): SessionEvent {
	return {
		type: "session.lifecycle",
		phase: "agent_start",
		schemaVersion: 1,
		sessionId,
		eventId,
		timestamp: 1,
		source: "runtime-core",
	};
}
