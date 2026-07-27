import type { AgentSessionEvent } from "@vetta/coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
	RuntimeHost,
	type RuntimeSession,
	type RuntimeSessionBackend,
	type RuntimeSessionCreateOptions,
	type SessionEvent,
} from "../../src/index.js";

function createSessionDouble() {
	const listeners = new Set<(event: AgentSessionEvent) => void>();
	const unsubscribers: ReturnType<typeof vi.fn>[] = [];
	const prompt = vi.fn(async () => {});
	const continueTurn = vi.fn(async () => {});
	const abort = vi.fn(async () => {});
	const session = {
		sessionId: "session-from-backend",
		sessionFile: undefined,
		sessionManager: {
			getCwd: () => undefined,
		},
		todoStore: {
			getAll: () => [],
		},
		prompt,
		agent: {
			continue: continueTurn,
		},
		abort,
		bindExtensions: vi.fn(async () => {}),
		subscribe: vi.fn((listener: (event: AgentSessionEvent) => void) => {
			listeners.add(listener);
			const unsubscribe = vi.fn(() => listeners.delete(listener));
			unsubscribers.push(unsubscribe);
			return unsubscribe;
		}),
		dispose: vi.fn(),
	} as unknown as RuntimeSession;

	return {
		session,
		unsubscribers,
		prompt,
		continueTurn,
		abort,
		emit: (event: AgentSessionEvent) => {
			for (const listener of listeners) listener(event);
		},
	};
}

class RecordingSessionBackend implements RuntimeSessionBackend {
	readonly calls: RuntimeSessionCreateOptions[] = [];

	constructor(private readonly session: RuntimeSession) {}

	async create(options: RuntimeSessionCreateOptions): Promise<RuntimeSession> {
		this.calls.push(options);
		return this.session;
	}
}

describe("RuntimeHost session backend boundary", () => {
	it("creates and registers a session through the injected backend without changing config semantics", async () => {
		const { session } = createSessionDouble();
		const backend = new RecordingSessionBackend(session);
		const host = new RuntimeHost({
			sessionBackend: backend,
			getDefaultExecutionMode: () => "full-access",
		});

		const result = await host.createSession({
			scenario: "cli",
			agentMode: "coding",
			enableBackgroundTasks: true,
			includeAgentSkills: false,
		});

		expect(result).toEqual({ sessionId: "session-from-backend" });
		expect(backend.calls).toHaveLength(1);
		expect(backend.calls[0]).toMatchObject({
			scenario: "cli",
			agentMode: "coding",
			enableBackgroundTasks: true,
			enableSubagents: true,
			includeAgentSkills: false,
			customTools: undefined,
		});
		expect(session.bindExtensions).toHaveBeenCalledOnce();
		expect(session.subscribe).toHaveBeenCalledOnce();
	});

	it("preserves prompt, continue and abort delegation semantics", async () => {
		const { session, prompt, continueTurn, abort } = createSessionDouble();
		const host = new RuntimeHost({
			sessionBackend: new RecordingSessionBackend(session),
			getDefaultExecutionMode: () => "full-access",
		});
		const { sessionId } = await host.createSession();
		const metadata = { origin: "characterization-test" };

		await host.prompt(sessionId, {
			text: "hello",
			streamingBehavior: "followUp",
			metadata,
		});
		await host.continue(sessionId);
		await host.abort(sessionId);

		expect(prompt).toHaveBeenCalledWith("hello", {
			images: undefined,
			streamingBehavior: "followUp",
			promptRef: undefined,
			attachments: undefined,
			source: "extension",
			metadata,
		});
		expect(continueTurn).toHaveBeenCalledOnce();
		expect(abort).toHaveBeenCalledOnce();
	});

	it("maps live events and replays the current text delta after resubscribe", async () => {
		const { session, emit, unsubscribers } = createSessionDouble();
		const host = new RuntimeHost({
			sessionBackend: new RecordingSessionBackend(session),
			getDefaultExecutionMode: () => "full-access",
		});
		const { sessionId } = await host.createSession();
		const firstEvents: SessionEvent[] = [];
		const unsubscribeFirst = host.subscribe(sessionId, (event) => firstEvents.push(event));

		emit({ type: "agent_start" });
		emit({
			type: "message_update",
			assistantMessageEvent: { type: "text_delta", delta: "partial" },
		} as AgentSessionEvent);

		expect(firstEvents.map((event) => event.type)).toEqual([
			"session.lifecycle",
			"session.lifecycle",
			"message.delta",
		]);
		unsubscribeFirst();
		expect(unsubscribers[1]).toHaveBeenCalledOnce();

		const replayedEvents: SessionEvent[] = [];
		host.subscribe(sessionId, (event) => replayedEvents.push(event));

		expect(replayedEvents.map((event) => event.type)).toEqual(["session.lifecycle", "message.delta"]);
		expect(replayedEvents[1]).toMatchObject({ type: "message.delta", delta: "partial" });
	});

	it("releases the injected backend session and its permanent subscription", async () => {
		const { session, unsubscribers } = createSessionDouble();
		const host = new RuntimeHost({
			sessionBackend: new RecordingSessionBackend(session),
			getDefaultExecutionMode: () => "full-access",
		});
		const { sessionId } = await host.createSession();

		await host.disposeSession(sessionId);

		expect(unsubscribers[0]).toHaveBeenCalledOnce();
		expect(session.dispose).toHaveBeenCalledOnce();
		expect(host.getSessionPath(sessionId)).toBeUndefined();
	});
});
