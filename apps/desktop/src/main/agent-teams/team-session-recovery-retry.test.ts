import { createAgentTeamFixture, type TeamSessionDocument } from "@vetta/agent-team";
import { createAssistantMessage } from "@vetta/ai";
import {
	type ConversationDocument,
	createEmptyConversationDocument,
	type RuntimeHost,
	type SessionConfig,
} from "@vetta/runtime-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerPresetPluginBlueprints } from "./preset-plugin-blueprints.testing.js";
import { TeamCollaborationStore } from "./team-collaboration-store.js";
import { AgentTeamSessionService } from "./team-session-service.js";

vi.mock("../conversations/resolve-session-config.js", () => ({
	resolveDesktopSessionConfig: vi.fn(async (config: SessionConfig) => ({ config })),
}));
vi.mock("../logger.js", () => ({
	getAppLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("../runtime.js", () => ({ getSharedRuntime: vi.fn() }));
vi.mock("../ipc/fs.js", () => ({ readDesktopConfig: vi.fn(async () => ({})) }));

beforeEach(() => {
	registerPresetPluginBlueprints();
	vi.useFakeTimers();
});
afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe("Team session reopening after interrupted recovery", () => {
	it("retries a failed publication repair when the user reopens the same session in the same process", async () => {
		const fixture = createFixture();
		const memberId = fixture.session.leaderMemberId;
		const begun = await fixture.store.begin({
			session: fixture.session,
			memberId,
			requestId: "request",
			createdByParticipantId: "local-user",
			objective: "Task",
			sourceTurnId: "turn",
			mode: "initial",
		});
		await fixture.store.append(fixture.session, "agent-team.publication-operation.v1", {
			customType: "agent-team.publication-operation.v1",
			operationId: `publish:${begun.workItem.id}:${begun.attempt.id}`,
			workItemId: begun.workItem.id,
			sourceParticipantConversationId: fixture.session.memberRuntime[memberId]!.sessionId,
			sourceTurnId: "turn",
			sourceMessageEntryId: "final",
			sourceMessageEntryIds: ["final"],
			state: "prepared",
			generation: 1,
			purpose: "result",
		});
		fixture.failNextPublicationWrite();
		await expect(
			fixture.service.read(fixture.session.id, fixture.session.coordinationRuntime!.sessionPath),
		).rejects.toThrow("Team session could not be loaded");
		expect(fixture.store.read(fixture.session).workItems[0]?.state).toBe("running");
		await fixture.service.read(fixture.session.id);
		expect(fixture.store.read(fixture.session).workItems[0]?.state).toBe("completed");
		expect(fixture.store.read(fixture.session).publications[0]?.state).toBe("completed");
		await fixture.service.read(fixture.session.id);
		expect(fixture.publicMessages()).toHaveLength(1);
		expect(fixture.runtime.prompt).not.toHaveBeenCalled();
		expect(fixture.runtime.disposeSession).not.toHaveBeenCalled();
		await fixture.service.abort(fixture.session.id);
	});

	it("establishes the coordination store before restored legacy member bindings need persistence", async () => {
		const fixture = createFixture(true);
		const restored = await fixture.service.read(fixture.session.id);
		expect(restored.coordinationRuntime?.sessionId).toBe(fixture.session.id);
		expect(Object.values(restored.memberRuntime).every((member) => member.agentProfileId)).toBe(true);
		expect(fixture.runtime.prompt).not.toHaveBeenCalled();
		expect(fixture.runtime.disposeSession).not.toHaveBeenCalled();
		await fixture.service.abort(fixture.session.id);
	});
});

function createFixture(legacy = false) {
	const document = createAgentTeamFixture();
	const team = document.teams[0]!;
	const conversations = new Map<string, ConversationDocument>();
	const paths = new Map<string, string>();
	const session: TeamSessionDocument = {
		schemaVersion: 1,
		revision: 0,
		id: "team-session",
		teamId: team.id,
		teamRevision: team.revision,
		name: "Team",
		cwd: "/workspace/team",
		leaderMemberId: team.leaderMemberId,
		memberHandles: Object.fromEntries(team.members.map((member) => [member.id, member.handle])),
		activeMemberIds: team.members.map((member) => member.id),
		events: [],
		createdAt: 1,
		updatedAt: 1,
		...(legacy
			? {}
			: { coordinationRuntime: { sessionId: "team-session", sessionPath: "/workspace/team-session.jsonl" } }),
		memberRuntime: Object.fromEntries(
			team.members.map((member, index) => [
				member.id,
				{
					sessionId: `member-${index}`,
					sessionPath: `/workspace/member-${index}.jsonl`,
					agentProfileRevision: 1,
					deliveredEventIds: [],
				},
			]),
		),
	};
	for (const binding of [session.coordinationRuntime, ...Object.values(session.memberRuntime)]) {
		if (!binding) continue;
		conversations.set(
			binding.sessionId,
			createEmptyConversationDocument({ sessionId: binding.sessionId, createdAt: 1 }),
		);
		if (!legacy) paths.set(binding.sessionId, binding.sessionPath);
	}
	let failNextPublicationWrite = false;
	const read = (id: string) => {
		const conversation = conversations.get(id);
		if (!conversation) throw new Error(`Missing conversation: ${id}`);
		return conversation;
	};
	const append: RuntimeHost["appendSessionMetadataEntry"] = async (id, customType, data) => {
		if (failNextPublicationWrite && customType === "agent-team.publication-operation.v1") {
			failNextPublicationWrite = false;
			throw new Error("simulated recovery write failure");
		}
		const current = read(id);
		const entryId = `custom-${current.entries.length}`;
		conversations.set(id, {
			...current,
			entries: [
				...current.entries,
				{
					type: "custom",
					id: entryId,
					parentId: current.activeLeafId,
					timestamp: new Date().toISOString(),
					customType,
					data,
				},
			],
			activeLeafId: entryId,
		});
	};
	const assistant = {
		...createAssistantMessage({ api: "openai-responses", provider: "openai", model: "test" }),
		content: [{ type: "text" as const, text: "Final answer" }],
		stopReason: "stop" as const,
	};
	const runtime = {
		readSessionDocument: read,
		appendSessionMetadataEntry: append,
		getSessionPath: (id: string) => paths.get(id),
		createSession: vi.fn(async (config: SessionConfig) => {
			const sessionId = config.sessionId ?? /([^/]+)\.jsonl$/.exec(config.sessionPath ?? "")?.[1];
			if (!sessionId) throw new Error("Missing fixture session identity");
			paths.set(sessionId, config.sessionPath ?? `/workspace/${sessionId}.jsonl`);
			if (!conversations.has(sessionId))
				conversations.set(sessionId, createEmptyConversationDocument({ sessionId, createdAt: 1 }));
			return { sessionId };
		}),
		appendConversationMessage: (async (id, message) => {
			const current = read(id);
			if (!current.entries.some((entry) => entry.id === message.id))
				conversations.set(id, {
					...current,
					entries: [
						...current.entries,
						{
							...message,
							type: "message",
							parentId: current.activeLeafId,
							timestamp: new Date(message.timestamp).toISOString(),
						},
					],
					activeLeafId: message.id,
				});
			return { entryId: message.id };
		}) satisfies RuntimeHost["appendConversationMessage"],
		getFullHistory: () => [{ type: "message", entryId: "final", message: assistant }],
		getState: () => ({ isStreaming: false }),
		subscribe: () => () => undefined,
		setExecutionMode: vi.fn(async () => undefined),
		getActiveTools: () => [],
		setActiveTools: vi.fn(),
		prompt: vi.fn(),
		abort: vi.fn(async () => undefined),
		disposeSession: vi.fn(async () => undefined),
	} as unknown as RuntimeHost;
	if (!legacy) {
		const current = read("team-session");
		conversations.set("team-session", {
			...current,
			entries: [
				{
					type: "custom",
					id: "state",
					parentId: null,
					timestamp: new Date(1).toISOString(),
					customType: "agent-team.session-state.v1",
					data: { customType: "agent-team.session-state.v1", session },
				},
			],
			activeLeafId: "state",
		});
	}
	const service = new AgentTeamSessionService({
		runtime,
		repository: { read: async () => session },
		readDocument: async () => document,
	});
	return {
		session,
		service,
		runtime,
		store: new TeamCollaborationStore(runtime),
		failNextPublicationWrite: () => {
			failNextPublicationWrite = true;
		},
		publicMessages: () =>
			read("team-session").entries.filter((entry) => entry.type === "message" && entry.kind === "agent"),
	};
}
