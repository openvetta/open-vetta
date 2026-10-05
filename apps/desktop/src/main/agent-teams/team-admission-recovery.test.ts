import { DEFAULT_AGENT_TEAM_EXTENSIONS, isTeamWorkItem, type TeamSessionDocument } from "@vetta/agent-team";
import { createEmptyConversationDocument, type RuntimeHost } from "@vetta/runtime-core";
import { applyConversationDocumentCommand, type ConversationMessageRecord } from "@vetta/runtime-core/conversation";
import { describe, expect, it, vi } from "vitest";
import { TeamCollaborationStore } from "./team-collaboration-store.js";
import { TeamMemberScheduler } from "./team-member-scheduler.js";
import { TeamNotificationJournal } from "./team-notification-journal.js";
import { TeamSessionEventHub } from "./team-session-event-hub.js";
import { TeamSessionStateRepository } from "./team-session-state-repository.js";
import { TeamTaskControlService } from "./team-task-control-service.js";
import { TeamTurnCoordinator } from "./team-turn-coordinator.js";

vi.mock("../logger.js", () => ({
	getAppLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

function fixture() {
	const documents = new Map([
		["coordination", createEmptyConversationDocument({ sessionId: "coordination", createdAt: 1 })],
	]);
	let failCancellation = false;
	let beforeWrite: ((customType: string, data: unknown) => Promise<void>) | undefined;
	const port = {
		readSessionDocument: (id = "coordination") => documents.get(id)!,
		appendSessionMetadataEntry: async (id: string, customType: string, data?: unknown) => {
			await beforeWrite?.(customType, data);
			if (
				failCancellation &&
				customType === "agent-team.work-item.v1" &&
				isTeamWorkItem(data) &&
				data.state === "cancelled"
			) {
				failCancellation = false;
				throw new Error("ENOSPC: cancellation could not be persisted");
			}
			const document = port.readSessionDocument(id);
			const entry = {
				type: "custom" as const,
				id: `entry-${document.entries.length}`,
				parentId: document.activeLeafId,
				timestamp: "1",
				customType,
				data,
			};
			documents.set(id, { ...document, entries: [...document.entries, entry], activeLeafId: entry.id });
		},
	};
	const store = new TeamCollaborationStore(port);
	const session: TeamSessionDocument = {
		schemaVersion: 1,
		revision: 0,
		id: "team-session",
		teamId: "team",
		name: "Team",
		cwd: "/fixture",
		leaderMemberId: "leader",
		memberHandles: { leader: "leader", member: "member" },
		createdAt: 1,
		updatedAt: 1,
		coordinationRuntime: { sessionId: "coordination", sessionPath: "/fixture/coordination" },
		events: [],
		memberRuntime: Object.fromEntries(
			["leader", "member"].map((id) => [
				id,
				{
					sessionId: `${id}-runtime`,
					sessionPath: `/fixture/${id}`,
					agentProfileRevision: 1,
					deliveredEventIds: [],
				},
			]),
		),
	};
	const journal = new TeamNotificationJournal(store);
	const runMemberTurn = vi.fn(async () => session);
	const controls = (activeStore = store, activeJournal = journal) =>
		new TeamTaskControlService(activeStore, new TeamMemberScheduler(), {
			readSession: async () => session,
			readConversation: (id) => port.readSessionDocument(id),
			runMemberTurn,
			cancelMemberTurn: () => {},
			isStopped: () => activeJournal.isStopped(session),
			stopGeneration: () => 0,
			authorizeTask: () => true,
			resolveTarget: (_session, handle) => handle,
			onAdmitted: async () => {},
			onSettled: async () => {},
			onRequeued: () => {},
		});
	const runtime = {
		...port,
		abort: vi.fn<RuntimeHost["abort"]>(async () => ({ status: "idle" })),
		hasSessionExtension: vi.fn(() => false),
		invokeSessionExtension: vi.fn(async () => undefined),
		appendConversationMessage: vi.fn(async (id: string, record: ConversationMessageRecord) => {
			documents.set(
				id,
				applyConversationDocumentCommand(port.readSessionDocument(id), { type: "message.append", record }).document,
			);
			return { entryId: record.id };
		}),
	} as unknown as RuntimeHost;
	const sessionState = new TeamSessionStateRepository({ runtime: () => runtime });
	sessionState.set(session);
	const eventHub = new TeamSessionEventHub({
		runtime: () => runtime,
		getSession: (id) => sessionState.get(id),
		observe: () => undefined,
	});
	const coordinator = new TeamTurnCoordinator({
		runtime: () => runtime,
		extensions: DEFAULT_AGENT_TEAM_EXTENSIONS,
		collaborationStore: store,
		sessionState,
		eventHub,
		readSession: async (id) => sessionState.get(id)!,
		readDocument: async () => ({ schemaVersion: 1, revision: 0, teams: [], agents: [] }),
		observations: () => undefined,
		publishSessionUpdated: () => {},
	});
	return {
		store,
		session,
		journal,
		controls,
		port,
		runtime,
		coordinator,
		addSession: (id: string) => {
			const coordinationId = `coordination-${id}`;
			documents.set(coordinationId, createEmptyConversationDocument({ sessionId: coordinationId, createdAt: 1 }));
			const next = {
				...session,
				id,
				coordinationRuntime: { sessionId: coordinationId, sessionPath: `/fixture/${coordinationId}` },
				memberRuntime: Object.fromEntries(
					Object.entries(session.memberRuntime).map(([memberId, runtime]) => [
						memberId,
						{ ...runtime, sessionId: `${id}-${memberId}-runtime`, sessionPath: `/fixture/${id}/${memberId}` },
					]),
				),
			};
			sessionState.set(next);
			return next;
		},
		runMemberTurn,
		beforeWrite: (run: typeof beforeWrite) => {
			beforeWrite = run;
		},
		failNextCancellation: () => {
			failCancellation = true;
		},
	};
}

describe("Team stop admission recovery", () => {
	it("finishes interrupted stop cancellations before new user work can lift the durable stop", async () => {
		const f = fixture();
		const old = await f.store.enqueue({
			session: f.session,
			memberId: "member",
			requestId: "old-task",
			createdByParticipantId: "leader",
			objective: "Old operation the user stopped",
		});
		await f.store.createDeliveries(f.session, [
			{
				id: "old-question",
				messageId: "question-message",
				fromParticipantId: "leader",
				toParticipantId: "member",
				intent: "question",
				state: "pending",
				workItemId: old.workItem.id,
				createdAt: 1,
				updatedAt: 1,
			},
		]);
		await f.journal.stop(f.session);
		f.failNextCancellation();
		await f.controls().stopTeam(f.session);
		expect(f.store.read(f.session).workItems[0]?.state).toBe("queued");

		// Restart preserves the stop; sending new user work may clear it only after
		// old work and old question deliveries have been durably cancelled.
		const restartedStore = new TeamCollaborationStore(f.port);
		const restartedJournal = new TeamNotificationJournal(restartedStore);
		expect(restartedJournal.isStopped(f.session)).toBe(true);
		await restartedJournal.resume(f.session);
		await f.controls(restartedStore, restartedJournal).recoverSession(f.session);

		expect(f.runMemberTurn).not.toHaveBeenCalled();
		expect(restartedStore.read(f.session).workItems[0]?.state).toBe("cancelled");
		expect(restartedStore.read(f.session).deliveries[0]?.state).toBe("cancelled");
		expect(restartedJournal.isStopped(f.session)).toBe(false);
	});

	it("keeps the stop durable when repairing old cancellations fails again", async () => {
		const f = fixture();
		await f.store.enqueue({
			session: f.session,
			memberId: "member",
			requestId: "old-task",
			createdByParticipantId: "leader",
			objective: "Old operation the user stopped",
		});
		await f.journal.stop(f.session);
		f.failNextCancellation();
		await expect(f.journal.resume(f.session)).rejects.toThrow("ENOSPC");
		expect(f.journal.isStopped(f.session)).toBe(true);
		await f.controls().recoverSession(f.session);
		expect(f.runMemberTurn).not.toHaveBeenCalled();
	});

	it("keeps in-memory admission closed when a new user send cannot repair the stopped work", async () => {
		const f = fixture();
		await f.store.enqueue({
			session: f.session,
			memberId: "member",
			requestId: "old-task",
			createdByParticipantId: "leader",
			objective: "Old operation the user stopped",
		});
		f.failNextCancellation();
		await f.coordinator.abort(f.session.id);
		f.failNextCancellation();
		await expect(
			f.coordinator.send(f.session.id, { requestId: "new-send", text: "New work", targetMemberIds: ["member"] }),
		).rejects.toThrow("ENOSPC");
		await expect(
			f.coordinator.taskControls(f.session.id).delegateTask({
				sourceRuntimeSessionId: "leader-runtime",
				sourceTurnId: "late-turn",
				toolCallId: "late-tool",
				signal: new AbortController().signal,
				requestId: "late-task",
				targetHandle: "member",
				objective: "Do not run",
			}),
		).rejects.toThrow("stopped");
		expect(f.journal.isStopped(f.session)).toBe(true);
		expect(f.store.read(f.session).workItems.map((item) => item.id)).toEqual(["work:old-task:member"]);
	});

	it("does not admit a new send before an earlier stop marker and cancellations are durable", async () => {
		vi.useFakeTimers();
		const f = fixture();
		const markerStarted = deferred();
		const releaseMarker = deferred();
		try {
			await f.store.enqueue({
				session: f.session,
				memberId: "member",
				requestId: "old-task",
				createdByParticipantId: "leader",
				objective: "Old work",
			});
			f.beforeWrite(async (type, data) => {
				if (type === "agent-team.recovery-stop.v1" && data === true) {
					markerStarted.resolve();
					await releaseMarker.promise;
				}
			});
			const stop = f.coordinator.abort(f.session.id);
			await markerStarted.promise;
			const send = f.coordinator
				.send(f.session.id, { requestId: "new-send", text: "New work", targetMemberIds: ["member"] })
				.catch((error: unknown) => error);
			await vi.advanceTimersByTimeAsync(0);
			expect(f.port.readSessionDocument().entries.some((entry) => entry.type === "message")).toBe(false);
			releaseMarker.resolve();
			await stop;
			// This focused fixture intentionally has no model executor. Reaching that
			// boundary proves new work was admitted only after the prior stop finished.
			expect(await send).toMatchObject({ message: "Team member attempt runner is unavailable" });
			expect(f.store.read(f.session).workItems.map((item) => [item.id, item.state])).toEqual([
				["work:old-task:member", "cancelled"],
				["work:new-send:member", "waiting"],
			]);
			expect(f.journal.isStopped(f.session)).toBe(false);
		} finally {
			releaseMarker.resolve();
			f.beforeWrite(undefined);
			await f.coordinator.abort(f.session.id);
			vi.useRealTimers();
		}
	});

	function deferred() {
		let resolve!: () => void;
		const promise = new Promise<void>((done) => {
			resolve = done;
		});
		return { promise, resolve };
	}

	it("repairs an in-memory stop whose marker and cancellation both failed before allowing new user work", async () => {
		const f = fixture();
		await f.store.enqueue({
			session: f.session,
			memberId: "member",
			requestId: "old-task",
			createdByParticipantId: "leader",
			objective: "Old work",
		});
		f.beforeWrite(async (type, data) => {
			if (type === "agent-team.recovery-stop.v1" && data === true) throw new Error("Stop marker unavailable");
		});
		f.failNextCancellation();
		await expect(f.coordinator.abort(f.session.id)).rejects.toThrow("Stop marker unavailable");
		expect(f.journal.isStopped(f.session)).toBe(false);
		f.beforeWrite(undefined);
		await expect(
			f.coordinator.send(f.session.id, { requestId: "new-send", text: "New work", targetMemberIds: ["member"] }),
		).rejects.toThrow("attempt runner is unavailable");
		expect(f.store.read(f.session).workItems.find((item) => item.id === "work:old-task:member")?.state).toBe(
			"cancelled",
		);
		await f.coordinator.abort(f.session.id);
	});

	it("refuses new work if a previously failed stop marker is still unwritable", async () => {
		const f = fixture();
		await f.store.enqueue({
			session: f.session,
			memberId: "member",
			requestId: "old-task",
			createdByParticipantId: "leader",
			objective: "Old work",
		});
		f.beforeWrite(async (type, data) => {
			if (type === "agent-team.recovery-stop.v1" && data === true) throw new Error("Stop marker unavailable");
		});
		f.failNextCancellation();
		await expect(f.coordinator.abort(f.session.id)).rejects.toThrow("Stop marker unavailable");
		await expect(
			f.coordinator.send(f.session.id, { requestId: "new-send", text: "New work", targetMemberIds: ["member"] }),
		).rejects.toThrow("Stop marker unavailable");
		await expect(
			f.coordinator.taskControls(f.session.id).delegateTask({
				sourceRuntimeSessionId: "leader-runtime",
				sourceTurnId: "late-turn",
				toolCallId: "late-tool",
				signal: new AbortController().signal,
				requestId: "late-task",
				targetHandle: "member",
				objective: "Do not run",
			}),
		).rejects.toThrow("stopped");
		expect(f.port.readSessionDocument().entries.some((entry) => entry.type === "message")).toBe(false);
	});

	it("allows concurrent new sends to share one completed stop repair without cancelling each other", async () => {
		const f = fixture();
		await f.store.enqueue({
			session: f.session,
			memberId: "member",
			requestId: "old-task",
			createdByParticipantId: "leader",
			objective: "Old work",
		});
		f.failNextCancellation();
		await f.coordinator.abort(f.session.id);
		const outcomes = await Promise.allSettled(
			["first", "second"].map((requestId) =>
				f.coordinator.send(f.session.id, { requestId, text: requestId, targetMemberIds: ["member"] }),
			),
		);
		expect(outcomes).toMatchObject([
			{ status: "rejected", reason: { message: "Team member attempt runner is unavailable" } },
			{ status: "rejected", reason: { message: "Team member attempt runner is unavailable" } },
		]);
		expect(f.store.read(f.session).workItems.map((item) => [item.id, item.state])).toEqual([
			["work:old-task:member", "cancelled"],
			["work:first:member", "waiting"],
			["work:second:member", "waiting"],
		]);
		expect(
			f.port
				.readSessionDocument()
				.entries.filter((entry) => entry.type === "custom" && entry.customType === "agent-team.recovery-stop.v1")
				.map((entry) => (entry.type === "custom" ? entry.data : undefined)),
		).toEqual([true, false]);
		await f.coordinator.abort(f.session.id);
	});

	it("does not block a different team session behind a paused stop write", async () => {
		vi.useFakeTimers();
		const f = fixture();
		const other = f.addSession("other-team-session");
		const markerStarted = deferred();
		const releaseMarker = deferred();
		let otherSettled = false;
		try {
			f.beforeWrite(async (type, data) => {
				if (type === "agent-team.recovery-stop.v1" && data === true) {
					markerStarted.resolve();
					await releaseMarker.promise;
				}
			});
			const stop = f.coordinator.abort(f.session.id);
			await markerStarted.promise;
			const send = f.coordinator
				.send(other.id, { requestId: "unrelated", text: "Other session work", targetMemberIds: ["member"] })
				.catch((error: unknown) => {
					otherSettled = true;
					return error;
				});
			await vi.advanceTimersByTimeAsync(0);
			expect(otherSettled).toBe(true);
			expect(f.port.readSessionDocument(other.coordinationRuntime!.sessionId).entries).toContainEqual(
				expect.objectContaining({ type: "message", kind: "user", turnId: "unrelated" }),
			);
			expect(f.port.readSessionDocument().entries.some((entry) => entry.type === "message")).toBe(false);
			releaseMarker.resolve();
			await stop;
			expect(await send).toMatchObject({ message: "Team member attempt runner is unavailable" });
		} finally {
			releaseMarker.resolve();
			f.beforeWrite(undefined);
			await f.coordinator.abort(other.id);
			vi.useRealTimers();
		}
	});

	it("waits for every earlier runtime stop and background cleanup before admitting a new send", async () => {
		vi.useFakeTimers();
		const f = fixture();
		const firstStarted = deferred();
		const secondStarted = deferred();
		const releaseFirst = deferred();
		const releaseSecond = deferred();
		let leaderStops = 0;
		try {
			vi.mocked(f.runtime.hasSessionExtension).mockReturnValue(true);
			vi.mocked(f.runtime.abort).mockImplementation(async (id) => {
				if (id !== "leader-runtime") return { status: "idle" };
				leaderStops += 1;
				if (leaderStops === 1) {
					firstStarted.resolve();
					await releaseFirst.promise;
				} else if (leaderStops === 2) {
					secondStarted.resolve();
					await releaseSecond.promise;
				}
				return { status: "aborted" };
			});
			const firstStop = f.coordinator.abort(f.session.id);
			await firstStarted.promise;
			const secondStop = f.coordinator.abort(f.session.id);
			await secondStarted.promise;
			releaseSecond.resolve();
			await secondStop;
			const send = f.coordinator
				.send(f.session.id, { requestId: "after-both-stops", text: "New work", targetMemberIds: ["member"] })
				.catch((error: unknown) => error);
			await vi.advanceTimersByTimeAsync(0);
			const admittedBeforeCleanup = vi.mocked(f.runtime.appendConversationMessage).mock.calls.length;
			releaseFirst.resolve();
			await firstStop;
			expect(await send).toMatchObject({ message: "Team member attempt runner is unavailable" });
			expect(admittedBeforeCleanup).toBe(0);
			const cleanupOrder = vi.mocked(f.runtime.invokeSessionExtension).mock.invocationCallOrder;
			const admissionOrder = vi.mocked(f.runtime.appendConversationMessage).mock.invocationCallOrder;
			expect(cleanupOrder).toHaveLength(6);
			expect(Math.max(...cleanupOrder)).toBeLessThan(admissionOrder[0]!);
		} finally {
			releaseFirst.resolve();
			releaseSecond.resolve();
			await f.coordinator.abort(f.session.id);
			vi.useRealTimers();
		}
	});
});
