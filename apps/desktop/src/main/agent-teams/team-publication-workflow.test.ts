import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TeamSessionDocument } from "@vetta/agent-team";
import { type AssistantMessage, createAssistantMessage } from "@vetta/ai";
import {
	type ConversationDocument,
	createEmptyConversationDocument,
	type HistoryEntry,
	type RuntimeHost,
} from "@vetta/runtime-core";
import { afterEach, describe, expect, it } from "vitest";
import { TeamCollaborationStore } from "./team-collaboration-store.js";
import { publicTeamAttemptResult } from "./team-public-message.js";
import { TeamPublicationWorkflow } from "./team-publication-workflow.js";
import { TeamSessionStateRepository } from "./team-session-state-repository.js";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Team publication crash recovery", () => {
	it("preserves the complete public result after the first public write fails before persistence", async () => {
		const fixture = createFixture();
		const first = assistant("First public step");
		const final = assistant("Final result");
		fixture.history.set("member-conversation", [
			{ type: "message", entryId: "first", message: first },
			{ type: "message", entryId: "final", message: final },
		]);
		const begun = await fixture.begin();
		fixture.failPublicWrite();
		await expect(
			fixture.workflow.publishAttempt({
				session: fixture.session,
				item: begun.workItem,
				attempt: begun.attempt,
				sourceTurnId: begun.attempt.sourceTurnId,
				sourceMessageEntryId: "final",
				...publicTeamAttemptResult(fixture.history.get("member-conversation") ?? [], new Set(), final),
				completeWorkItem: async (id) => {
					await fixture.store.completePublished(fixture.session, begun.workItem.id, begun.attempt.id, id);
				},
			}),
		).rejects.toThrow("simulated disk write failure");
		expect(fixture.publicMessages()).toHaveLength(0);
		await fixture.reopen().recover(fixture.session);
		expect(fixture.publicMessages()).toMatchObject([{ message: { content: [...first.content, ...final.content] } }]);
		expect(fixture.store.read(fixture.session).workItems[0]?.state).toBe("completed");
		await fixture.reopen().recover(fixture.session);
		expect(fixture.publicMessages()).toHaveLength(1);
	});

	it("keeps a failed tool-use progress message waiting for retry instead of completing the task on reopen", async () => {
		const fixture = createFixture();
		const progress: AssistantMessage = {
			...assistant("I will start by checking the file"),
			content: [
				{ type: "text", text: "I will start by checking the file" },
				{ type: "toolCall", id: "read", name: "read", arguments: {} },
			],
			stopReason: "toolUse",
		};
		fixture.history.set("member-conversation", [{ type: "message", entryId: "progress", message: progress }]);
		const begun = await fixture.begin();
		await fixture.workflow.publishPartialAttempt({
			session: fixture.session,
			item: begun.workItem,
			attempt: begun.attempt,
			sourceTurnId: begun.attempt.sourceTurnId,
			sourceMessageEntryId: "progress",
			sourceMessageEntryIds: ["progress"],
			assistant: progress,
		});
		await fixture.store.settle(fixture.session, begun.workItem, begun.attempt, {
			state: "waiting-retry",
			issue: { category: "network", retryability: "automatic", code: "AI_TIMEOUT" },
		});
		await fixture.reopen().recover(fixture.session);
		expect(fixture.store.read(fixture.session).workItems[0]?.state).toBe("waiting");
		expect(fixture.store.read(fixture.session).publications[0]?.state).toBe("message-published");
		expect(fixture.publicMessages()).toHaveLength(1);
	});

	it("settles an already durable public result after the member runtime was rebound without reading private history", async () => {
		const fixture = createFixture();
		const begun = await fixture.begin();
		fixture.failWorkItemCompletion();
		await expect(
			fixture.workflow.publishAttempt({
				session: fixture.session,
				item: begun.workItem,
				attempt: begun.attempt,
				sourceTurnId: begun.attempt.sourceTurnId,
				sourceMessageEntryId: "final",
				sourceMessageEntryIds: ["final"],
				assistant: assistant("Final result"),
				completeWorkItem: async (id) => {
					await fixture.store.completePublished(fixture.session, begun.workItem.id, begun.attempt.id, id);
				},
			}),
		).rejects.toThrow("simulated disk write failure");
		await fixture.reopen().recover({
			...fixture.session,
			memberRuntime: { member: { ...fixture.session.memberRuntime.member!, sessionId: "rebound-runtime" } },
		});
		expect(fixture.store.read(fixture.session).workItems[0]?.state).toBe("completed");
		expect(fixture.publicMessages()).toHaveLength(1);
	});

	it("keeps missing aggregate sources pending, then repairs exactly once when the history becomes available", async () => {
		const fixture = createFixture();
		const first = assistant("First public step");
		const final = assistant("Final result");
		fixture.history.set("member-conversation", [{ type: "message", entryId: "final", message: final }]);
		const begun = await fixture.begin();
		fixture.failPublicWrite();
		await expect(
			fixture.workflow.publishAttempt({
				session: fixture.session,
				item: begun.workItem,
				attempt: begun.attempt,
				sourceTurnId: begun.attempt.sourceTurnId,
				sourceMessageEntryId: "final",
				sourceMessageEntryIds: ["first", "final"],
				assistant: { ...final, content: [...first.content, ...final.content] },
				completeWorkItem: async () => {
					throw new Error("publication must fail before completion");
				},
			}),
		).rejects.toThrow("simulated disk write failure");
		await fixture.reopen().recover(fixture.session);
		expect(fixture.publicMessages()).toHaveLength(0);
		expect(fixture.store.read(fixture.session).publications[0]?.state).toBe("needs-recovery");
		expect(fixture.store.read(fixture.session).workItems[0]?.state).toBe("running");
		fixture.history.set("member-conversation", [
			{ type: "message", entryId: "unrelated-before", message: assistant("Other request before") },
			{ type: "message", entryId: "first", message: first },
			{ type: "message", entryId: "final", message: final },
			{ type: "message", entryId: "unrelated-after", message: assistant("Other request after") },
		]);
		await fixture.reopen().recover(fixture.session);
		await fixture.reopen().recover(fixture.session);
		expect(fixture.publicMessages()).toMatchObject([{ message: { content: [...first.content, ...final.content] } }]);
		expect(fixture.store.read(fixture.session).publications[0]?.state).toBe("completed");
	});

	it("refuses a publication whose source conversation is not owned by its attempt and member", async () => {
		const fixture = createFixture();
		const final = assistant("Foreign member private answer");
		fixture.history.set("foreign-conversation", [{ type: "message", entryId: "final", message: final }]);
		const begun = await fixture.begin();
		fixture.failPublicWrite();
		await expect(
			fixture.workflow.publishAttempt({
				session: fixture.session,
				item: begun.workItem,
				attempt: begun.attempt,
				sourceTurnId: begun.attempt.sourceTurnId,
				sourceMessageEntryId: "final",
				sourceMessageEntryIds: ["final"],
				assistant: final,
				completeWorkItem: async () => {
					throw new Error("publication must fail before completion");
				},
			}),
		).rejects.toThrow("simulated disk write failure");
		await fixture.store.append(fixture.session, "agent-team.publication-operation.v1", {
			...fixture.store.read(fixture.session).publications[0],
			sourceParticipantConversationId: "foreign-conversation",
		});
		await fixture.reopen().recover(fixture.session);
		expect(fixture.publicMessages()).toHaveLength(0);
		expect(fixture.store.read(fixture.session).publications[0]?.state).toBe("needs-recovery");
	});

	it.each(["Unrelated earlier task", "Task"])(
		"never attributes earlier private work to an attempt cancelled before its prompt was persisted (%s)",
		async (previousText) => {
			const fixture = createFixture();
			fixture.history.set("member-conversation", [
				{
					type: "message",
					entryId: "previous-user",
					message: { role: "user", content: previousText, timestamp: 1 },
				},
				{ type: "message", entryId: "previous-answer", message: assistant("Unrelated earlier answer") },
			]);
			const begun = await fixture.begin();
			await fixture.store.settle(fixture.session, begun.workItem, begun.attempt, { state: "cancelled" });
			await fixture.reopen().recover(fixture.session);
			expect(fixture.publicMessages()).toHaveLength(0);
			expect(fixture.store.read(fixture.session).publications).toHaveLength(0);
		},
	);

	it("still restores legacy history with an attributable prompt and no publication ledger", async () => {
		const fixture = createFixture();
		fixture.history.set("member-conversation", [
			{ type: "message", entryId: "legacy-user", message: { role: "user", content: "Task", timestamp: 2 } },
			{ type: "message", entryId: "legacy-answer", message: assistant("Legacy answer") },
		]);
		const begun = await fixture.begin();
		await fixture.store.append(fixture.session, "agent-team.work-item.v1", {
			...begun.workItem,
			createdAt: 1,
			state: "cancelled",
		});
		await fixture.store.append(fixture.session, "agent-team.member-attempt.v1", {
			...begun.attempt,
			lastProgressAt: 3,
			state: "cancelled",
		});
		await fixture.reopen().recover(fixture.session);
		await fixture.reopen().recover(fixture.session);
		expect(fixture.publicMessages()).toMatchObject([
			{ message: { content: [{ type: "text", text: "Legacy answer" }] } },
		]);
	});

	it("finishes the work item when the process exits after persisting only attempt completion", async () => {
		const fixture = createFixture();
		const final = assistant("Final result");
		fixture.history.set("member-conversation", [{ type: "message", entryId: "final", message: final }]);
		const begun = await fixture.begin();
		// The same write ordering is used by TeamCollaborationStore.completePublished/settle.
		fixture.failWorkItemCompletion();
		await expect(
			fixture.workflow.publishAttempt({
				session: fixture.session,
				item: begun.workItem,
				attempt: begun.attempt,
				sourceTurnId: begun.attempt.sourceTurnId,
				sourceMessageEntryId: "final",
				assistant: final,
				completeWorkItem: async (id) => {
					await fixture.store.completePublished(fixture.session, begun.workItem.id, begun.attempt.id, id);
				},
			}),
		).rejects.toThrow("simulated disk write failure");
		expect(fixture.store.read(fixture.session).attempts[0]?.state).toBe("completed");
		await fixture.reopen().recover(fixture.session);
		expect(fixture.store.read(fixture.session).workItems[0]?.state).toBe("completed");
		expect(fixture.publicMessages()).toHaveLength(1);
	});

	it("does not let legacy backfill reclassify a prepared result after its attempt was settled for retry", async () => {
		const fixture = createFixture();
		const final = assistant("Final result");
		fixture.history.set("member-conversation", [{ type: "message", entryId: "final", message: final }]);
		const begun = await fixture.begin();
		fixture.failPublicWrite();
		await expect(
			fixture.workflow.publishAttempt({
				session: fixture.session,
				item: begun.workItem,
				attempt: begun.attempt,
				sourceTurnId: begun.attempt.sourceTurnId,
				sourceMessageEntryId: "final",
				assistant: final,
				completeWorkItem: async (id) => {
					await fixture.store.completePublished(fixture.session, begun.workItem.id, begun.attempt.id, id);
				},
			}),
		).rejects.toThrow("simulated disk write failure");
		await fixture.store.settle(fixture.session, begun.workItem, begun.attempt, {
			state: "waiting-retry",
			issue: { category: "network", retryability: "automatic", code: "AI_TIMEOUT" },
		});
		await fixture.reopen().recover(fixture.session);
		expect(fixture.store.read(fixture.session).workItems[0]?.state).toBe("completed");
		expect(fixture.store.read(fixture.session).publications[0]).toMatchObject({
			purpose: "result",
			state: "completed",
		});
		expect(fixture.publicMessages()).toMatchObject([{ message: { stopReason: "stop" } }]);
	});
});

function assistant(text: string): AssistantMessage {
	return {
		...createAssistantMessage({ api: "openai-responses", provider: "openai", model: "test" }),
		content: [{ type: "text", text }],
		stopReason: "stop",
	};
}

function createFixture() {
	const root = mkdtempSync(join(tmpdir(), "vetta-publication-test-"));
	roots.push(root);
	const path = join(root, "coordination.json");
	const session: TeamSessionDocument = {
		schemaVersion: 1,
		revision: 0,
		id: "team-session",
		teamId: "team",
		name: "Team",
		cwd: root,
		leaderMemberId: "member",
		memberHandles: { member: "member" },
		createdAt: 1,
		updatedAt: 1,
		coordinationRuntime: { sessionId: "coordination", sessionPath: path },
		events: [],
		memberRuntime: {
			member: {
				sessionId: "member-conversation",
				sessionPath: join(root, "member.jsonl"),
				agentProfileRevision: 1,
				deliveredEventIds: [],
			},
		},
	};
	writeFileSync(path, JSON.stringify(createEmptyConversationDocument({ sessionId: "coordination", createdAt: 1 })));
	const history = new Map<string, HistoryEntry[]>();
	let failPublicWrite = false;
	let failWorkItemCompletion = false;
	const read = (): ConversationDocument => JSON.parse(readFileSync(path, "utf8"));
	const append = (entry: ConversationDocument["entries"][number]) => {
		const current = read();
		writeFileSync(
			path,
			JSON.stringify({
				...current,
				revision: current.revision + 1,
				entries: [...current.entries, entry],
				activeLeafId: entry.id,
			}),
		);
	};
	const port = {
		readSessionDocument: () => read(),
		appendSessionMetadataEntry: async (_id: string, customType: string, data?: unknown) => {
			if (
				failWorkItemCompletion &&
				customType === "agent-team.work-item.v1" &&
				typeof data === "object" &&
				data !== null &&
				"state" in data &&
				data.state === "completed"
			) {
				failWorkItemCompletion = false;
				throw new Error("simulated disk write failure");
			}
			const current = read();
			append({
				id: `custom-${current.entries.length}`,
				parentId: current.activeLeafId,
				type: "custom",
				customType,
				data,
				timestamp: new Date().toISOString(),
			});
		},
		appendConversationMessage: (async (_id, record) => {
			if (failPublicWrite) {
				failPublicWrite = false;
				throw new Error("simulated disk write failure");
			}
			if (!read().entries.some((entry) => entry.id === record.id))
				append({
					...record,
					type: "message",
					parentId: read().activeLeafId,
					timestamp: new Date(record.timestamp).toISOString(),
				});
			return { entryId: record.id };
		}) satisfies RuntimeHost["appendConversationMessage"],
		getFullHistory: (id: string) => history.get(id) ?? [],
	};
	const runtime = port as unknown as RuntimeHost;
	const store = new TeamCollaborationStore(port);
	const reopen = () => {
		const sessionState = new TeamSessionStateRepository({ runtime: () => runtime });
		sessionState.set(session);
		return new TeamPublicationWorkflow({
			runtime: () => runtime,
			collaborationStore: new TeamCollaborationStore(port),
			sessionState,
			observations: () => undefined,
		});
	};
	return {
		session,
		history,
		store,
		reopen,
		workflow: reopen(),
		begin: () =>
			store.begin({
				session,
				memberId: "member",
				requestId: "request",
				createdByParticipantId: "local-user",
				objective: "Task",
				sourceTurnId: "turn",
				mode: "initial",
			}),
		failPublicWrite: () => {
			failPublicWrite = true;
		},
		failWorkItemCompletion: () => {
			failWorkItemCompletion = true;
		},
		publicMessages: () => read().entries.filter((entry) => entry.type === "message" && entry.kind === "agent"),
	};
}
