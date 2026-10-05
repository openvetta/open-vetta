// @vitest-environment jsdom

import type {
	DesktopTeamSessionSnapshot,
	DesktopTeamSessionStreamEvent,
} from "@preload/api-types/team-conversation-display";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createAgentTeamFixture } from "@vetta/agent-team";
import { createAssistantMessage } from "@vetta/ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stageTeamSessionHandoff, takeTeamSessionHandoff } from "./team-session-handoff";
import { useTeamChatModel } from "./useTeamChatModel";

const translate = vi.hoisted(() => (key: string) => key);
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate }) }));

const document = createAgentTeamFixture();
const team = document.teams[0]!;
const member = team.members.find((candidate) => candidate.id !== team.leaderMemberId)!;
const snapshot: DesktopTeamSessionSnapshot = {
	session: {
		schemaVersion: 1,
		revision: 1,
		id: "team-lifecycle",
		teamId: team.id,
		name: team.name,
		cwd: "/workspace/team",
		orchestrationPolicyId: team.orchestrationPolicyId,
		contextPolicyId: team.contextPolicyId,
		leaderMemberId: team.leaderMemberId,
		memberHandles: Object.fromEntries(team.members.map((candidate) => [candidate.id, candidate.handle])),
		createdAt: 1,
		updatedAt: 1,
		events: [],
		memberRuntime: {},
		coordinationRuntime: { sessionId: "coordination", sessionPath: "/sessions/team.jsonl" },
	},
	conversationRevision: 1,
	messages: [],
	activities: [],
};
const workingSnapshot: DesktopTeamSessionSnapshot = {
	...snapshot,
	session: { ...snapshot.session, revision: 2 },
	conversationRevision: 2,
	display: { memberConversations: [], workingMemberIds: [member.id] },
};
const otherSnapshot: DesktopTeamSessionSnapshot = {
	...snapshot,
	session: { ...snapshot.session, id: "other-team-session", cwd: "/workspace/other" },
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (cause: Error) => void;
	const promise = new Promise<T>((complete, fail) => {
		resolve = complete;
		reject = fail;
	});
	return { promise, resolve, reject };
}

describe("Team send completion lifecycle", () => {
	let listener: ((event: DesktopTeamSessionStreamEvent) => void) | undefined;

	beforeEach(() => {
		listener = undefined;
		takeTeamSessionHandoff(otherSnapshot.session.id);
		window.localStorage.clear();
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: {
				agentTeams: {
					list: vi.fn(async () => document),
					listSessions: vi.fn(async () => [
						{
							id: snapshot.session.id,
							coordinationSessionPath: "/sessions/team.jsonl",
							title: team.name,
							createdAt: 1,
							updatedAt: 1,
						},
					]),
					getSession: vi.fn(async () => snapshot),
					subscribe: vi.fn(async (_id: string, handler: typeof listener) => {
						listener = handler;
						return () => {
							listener = undefined;
						};
					}),
					sendMessage: vi.fn(async () => snapshot),
					abort: vi.fn(async () => undefined),
				},
			},
		});
	});

	function enableOtherSession() {
		vi.mocked(window.vetta.agentTeams.listSessions).mockResolvedValue(
			[snapshot, otherSnapshot].map((item) => ({
				id: item.session.id,
				coordinationSessionPath: `/sessions/${item.session.id}.jsonl`,
				title: item.session.id,
				createdAt: 1,
				updatedAt: 1,
			})),
		);
		vi.mocked(window.vetta.agentTeams.getSession).mockImplementation(async (reference) =>
			(typeof reference === "string" ? reference : reference.id) === otherSnapshot.session.id
				? otherSnapshot
				: snapshot,
		);
	}

	it("hands a new conversation its first message while the previous conversation is still sending", async () => {
		enableOtherSession();
		const previous = deferred<DesktopTeamSessionSnapshot>();
		vi.mocked(window.vetta.agentTeams.sendMessage)
			.mockReturnValueOnce(previous.promise)
			.mockResolvedValueOnce(otherSnapshot);
		window.vetta.agentTeams.createSessionRecord = vi.fn(async () => otherSnapshot);
		const { result, rerender } = renderHook(({ sessionId }) => useTeamChatModel(team.id, sessionId), {
			initialProps: { sessionId: snapshot.session.id },
		});
		await waitFor(() => expect(result.current.model.activeSessionId).toBe(snapshot.session.id));
		act(() => result.current.actions.setDraft("First task keeps running"));
		let oldSend: Promise<void> | undefined;
		act(() => {
			oldSend = result.current.actions.send();
		});
		await waitFor(() => expect(window.vetta.agentTeams.sendMessage).toHaveBeenCalledTimes(1));
		stageTeamSessionHandoff({
			sessionId: otherSnapshot.session.id,
			requestId: "new-conversation-first-send",
			document,
			text: "New conversation first task",
			memberMentions: [],
			attachments: [],
			timestamp: 2,
			executionMode: "full-access",
		});
		rerender({ sessionId: otherSnapshot.session.id });
		await waitFor(() => expect(window.vetta.agentTeams.sendMessage).toHaveBeenCalledTimes(2));
		expect(window.vetta.agentTeams.sendMessage).toHaveBeenLastCalledWith(
			otherSnapshot.session.id,
			expect.objectContaining({ requestId: "new-conversation-first-send" }),
		);
		expect(window.vetta.agentTeams.createSessionRecord).toHaveBeenCalledTimes(1);
		expect(window.vetta.agentTeams.abort).not.toHaveBeenCalled();
		await act(async () => {
			previous.resolve(workingSnapshot);
			await oldSend;
		});
		expect(result.current.model.activeSessionId).toBe(otherSnapshot.session.id);
		expect(
			result.current.model.feedItems.some(
				(item) => item.kind === "user" && item.text === "First task keeps running",
			),
		).toBe(false);
	});

	it.each(["success", "failure"] as const)(
		"keeps the selected conversation and its draft when a previous conversation send settles with %s",
		async (outcome) => {
			enableOtherSession();
			const previous = deferred<DesktopTeamSessionSnapshot>();
			vi.mocked(window.vetta.agentTeams.sendMessage).mockReturnValueOnce(previous.promise);
			const { result, rerender } = renderHook(({ sessionId }) => useTeamChatModel(team.id, sessionId), {
				initialProps: { sessionId: snapshot.session.id },
			});
			await waitFor(() => expect(result.current.model.activeSessionId).toBe(snapshot.session.id));
			act(() => result.current.actions.setDraft("The first conversation task"));
			let send: Promise<void> | undefined;
			act(() => {
				send = result.current.actions.send();
			});
			await waitFor(() => expect(window.vetta.agentTeams.sendMessage).toHaveBeenCalledOnce());
			rerender({ sessionId: otherSnapshot.session.id });
			await waitFor(() => expect(result.current.model.activeSessionId).toBe(otherSnapshot.session.id));
			act(() => result.current.actions.setDraft("The second conversation draft"));
			await act(async () => {
				if (outcome === "success") previous.resolve(workingSnapshot);
				else previous.reject(new Error("First conversation failed"));
				await send;
			});
			expect(result.current.model.activeSessionId).toBe(otherSnapshot.session.id);
			expect(result.current.model.workspace?.cwd).toBe(otherSnapshot.session.cwd);
			expect(result.current.model.status).toBe("ready");
			expect(result.current.model.draft).toBe("The second conversation draft");
			expect(result.current.model.feedItems).toEqual([]);
			expect(window.vetta.agentTeams.abort).not.toHaveBeenCalled();
			rerender({ sessionId: snapshot.session.id });
			await waitFor(() => expect(result.current.model.activeSessionId).toBe(snapshot.session.id));
			if (outcome === "failure") expect(result.current.model.draft).toBe("The first conversation task");
			else expect(result.current.model.history).toContain("The first conversation task");
		},
	);

	it("does not restore an old failure over a newer request after leaving and returning to a conversation", async () => {
		enableOtherSession();
		const previous = deferred<DesktopTeamSessionSnapshot>();
		const current = deferred<DesktopTeamSessionSnapshot>();
		vi.mocked(window.vetta.agentTeams.sendMessage)
			.mockReturnValueOnce(previous.promise)
			.mockReturnValueOnce(current.promise);
		const { result, rerender } = renderHook(({ sessionId }) => useTeamChatModel(team.id, sessionId), {
			initialProps: { sessionId: snapshot.session.id },
		});
		await waitFor(() => expect(result.current.model.activeSessionId).toBe(snapshot.session.id));
		act(() => result.current.actions.setDraft("Old request"));
		let oldSend: Promise<void> | undefined;
		act(() => {
			oldSend = result.current.actions.send();
		});
		await waitFor(() => expect(window.vetta.agentTeams.sendMessage).toHaveBeenCalledTimes(1));
		rerender({ sessionId: otherSnapshot.session.id });
		await waitFor(() => expect(result.current.model.activeSessionId).toBe(otherSnapshot.session.id));
		rerender({ sessionId: snapshot.session.id });
		await waitFor(() => expect(result.current.model.activeSessionId).toBe(snapshot.session.id));
		act(() => result.current.actions.setDraft("New request"));
		let newSend: Promise<void> | undefined;
		act(() => {
			newSend = result.current.actions.send();
		});
		await waitFor(() => expect(window.vetta.agentTeams.sendMessage).toHaveBeenCalledTimes(2));
		await act(async () => {
			previous.reject(new Error("Old view failure"));
			await oldSend;
		});
		expect(result.current.model.status).toBe("sending");
		expect(result.current.model.draft).toBe("");
		expect(result.current.model.feedItems).toContainEqual(
			expect.objectContaining({ kind: "user", text: "New request" }),
		);
		await act(async () => {
			current.resolve(snapshot);
			await newSend;
		});
	});

	it.each(["model", "execution mode"] as const)(
		"keeps late %s settings on the conversation that requested them",
		async (kind) => {
			enableOtherSession();
			const previous = deferred<DesktopTeamSessionSnapshot>();
			window.vetta.agentTeams.updateModelSettings = vi.fn(() => previous.promise);
			window.vetta.agentTeams.setExecutionMode = vi.fn(() => previous.promise);
			const { result, rerender } = renderHook(({ sessionId }) => useTeamChatModel(team.id, sessionId), {
				initialProps: { sessionId: snapshot.session.id },
			});
			await waitFor(() => expect(result.current.model.activeSessionId).toBe(snapshot.session.id));
			let save: Promise<void> | undefined;
			act(() => {
				save =
					kind === "model"
						? result.current.actions.selectModel("fixture/model")
						: result.current.actions.setExecutionMode?.("sandbox");
			});
			rerender({ sessionId: otherSnapshot.session.id });
			await waitFor(() => expect(result.current.model.activeSessionId).toBe(otherSnapshot.session.id));
			await act(async () => {
				previous.resolve({
					...workingSnapshot,
					session: {
						...workingSnapshot.session,
						executionMode: "sandbox",
						modelSettings: { modelKey: "fixture/model" },
					},
				});
				await save;
			});
			expect(result.current.model.activeSessionId).toBe(otherSnapshot.session.id);
			expect(result.current.model.executionMode).toBe("full-access");
			expect(result.current.model.modelKey).toBeNull();
		},
	);

	it.each(["response", "newer snapshot", "live stream"] as const)(
		"keeps the Team running after the leader returns while a member is working in the %s",
		async (source) => {
			const completion = deferred<DesktopTeamSessionSnapshot>();
			vi.mocked(window.vetta.agentTeams.sendMessage).mockReturnValueOnce(completion.promise);
			const { result } = renderHook(() => useTeamChatModel(team.id, snapshot.session.id));
			await waitFor(() => expect(result.current.model.status).toBe("ready"));
			act(() => result.current.actions.setDraft("Delegate the research"));
			let send: Promise<void> | undefined;
			act(() => {
				send = result.current.actions.send();
			});
			await waitFor(() => expect(window.vetta.agentTeams.sendMessage).toHaveBeenCalledOnce());
			if (source === "newer snapshot") {
				act(() =>
					listener?.({
						type: "session-updated",
						teamSessionId: snapshot.session.id,
						snapshot: workingSnapshot,
					}),
				);
			} else if (source === "live stream") {
				const partial = {
					...createAssistantMessage({ api: "agent-team-test", provider: "fixture", model: "fixture" }),
					content: [{ type: "text" as const, text: "Researching" }],
				};
				act(() =>
					listener?.({
						type: "conversation.agent-message-event",
						conversationId: snapshot.session.id,
						messageId: "member-result",
						turnId: "member-request",
						author: { kind: "agent", id: member.id },
						sequence: 1,
						timestamp: 2,
						event: { type: "text_delta", contentIndex: 0, delta: "Researching", partial },
					}),
				);
			}
			await act(async () => {
				completion.resolve(source === "response" ? workingSnapshot : snapshot);
				await send;
			});
			expect(result.current.model.members.find((candidate) => candidate.id === member.id)?.status).toBe("working");
			expect(result.current.model.status).toBe("streaming");
			act(() => result.current.actions.setDraft("A follow-up instruction"));
			expect(result.current.model.canSend).toBe(true);
			await act(async () => result.current.actions.abort());
			expect(window.vetta.agentTeams.abort).toHaveBeenCalledWith(snapshot.session.id);
			expect(result.current.model.members.find((candidate) => candidate.id === member.id)?.status).toBe("idle");
			expect(result.current.model.status).toBe("ready");
		},
	);

	it("does not revive the running indicator when a stopped send returns late", async () => {
		const completion = deferred<DesktopTeamSessionSnapshot>();
		vi.mocked(window.vetta.agentTeams.sendMessage).mockReturnValueOnce(completion.promise);
		const { result } = renderHook(() => useTeamChatModel(team.id, snapshot.session.id));
		await waitFor(() => expect(result.current.model.status).toBe("ready"));
		act(() => result.current.actions.setDraft("Delegate the research"));
		let send: Promise<void> | undefined;
		act(() => {
			send = result.current.actions.send();
		});
		await waitFor(() => expect(window.vetta.agentTeams.sendMessage).toHaveBeenCalledOnce());
		await act(async () => result.current.actions.abort());
		await act(async () => {
			completion.resolve(workingSnapshot);
			await send;
		});
		expect(result.current.model.members.find((candidate) => candidate.id === member.id)?.status).toBe("idle");
		act(() =>
			listener?.({
				type: "desktop.team-context-usage",
				conversationId: snapshot.session.id,
				memberId: member.id,
				runtimeSessionId: "member-runtime",
				contextUsage: { percent: 10, contextWindow: 10000 },
			}),
		);
		expect(result.current.model.status).toBe("ready");
	});

	it("keeps a new user request pending when the stopped send returns late", async () => {
		const previous = deferred<DesktopTeamSessionSnapshot>();
		const current = deferred<DesktopTeamSessionSnapshot>();
		vi.mocked(window.vetta.agentTeams.sendMessage)
			.mockReturnValueOnce(previous.promise)
			.mockReturnValueOnce(current.promise);
		const { result } = renderHook(() => useTeamChatModel(team.id, snapshot.session.id));
		await waitFor(() => expect(result.current.model.status).toBe("ready"));
		act(() => result.current.actions.setDraft("The old task"));
		let oldSend: Promise<void> | undefined;
		act(() => {
			oldSend = result.current.actions.send();
		});
		await waitFor(() => expect(window.vetta.agentTeams.sendMessage).toHaveBeenCalledTimes(1));
		await act(async () => result.current.actions.abort());
		act(() => result.current.actions.setDraft("The new task"));
		let newSend: Promise<void> | undefined;
		act(() => {
			newSend = result.current.actions.send();
		});
		await waitFor(() => expect(window.vetta.agentTeams.sendMessage).toHaveBeenCalledTimes(2));
		await act(async () => {
			previous.resolve(workingSnapshot);
			await oldSend;
		});
		expect(result.current.model.status).toBe("sending");
		expect(result.current.model.feedItems).toContainEqual(
			expect.objectContaining({ kind: "user", text: "The new task" }),
		);
		await act(async () => {
			current.resolve(snapshot);
			await newSend;
		});
		expect(result.current.model.status).toBe("ready");
	});

	it("does not let a stopped failure hide replacement work or restore the canceled draft", async () => {
		const previous = deferred<DesktopTeamSessionSnapshot>();
		vi.mocked(window.vetta.agentTeams.sendMessage)
			.mockReturnValueOnce(previous.promise)
			.mockResolvedValueOnce(workingSnapshot);
		const { result } = renderHook(() => useTeamChatModel(team.id, snapshot.session.id));
		await waitFor(() => expect(result.current.model.status).toBe("ready"));
		act(() => result.current.actions.setDraft("The canceled task"));
		let oldSend: Promise<void> | undefined;
		act(() => {
			oldSend = result.current.actions.send();
		});
		await waitFor(() => expect(window.vetta.agentTeams.sendMessage).toHaveBeenCalledTimes(1));
		await act(async () => result.current.actions.abort());
		act(() => result.current.actions.setDraft("The replacement task"));
		await act(async () => result.current.actions.send());
		expect(result.current.model.status).toBe("streaming");
		await act(async () => {
			previous.reject(new Error("The old turn was canceled"));
			await oldSend;
		});
		expect(result.current.model.status).toBe("streaming");
		expect(result.current.model.draft).toBe("");
		expect(
			result.current.model.feedItems.some(
				(item) => item.kind === "agent" && item.blocks.some((block) => block.type === "error"),
			),
		).toBe(false);
	});
});
