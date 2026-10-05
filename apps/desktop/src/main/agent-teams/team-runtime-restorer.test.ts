import type { TeamSessionDocument } from "@vetta/agent-team";
import { RuntimeHost, type SessionConfig } from "@vetta/runtime-core";
import { describe, expect, it, vi } from "vitest";
import { createTeamRuntimeTestAssembly } from "./team-runtime-host.testing.js";
import { restoreTeamMemberRuntimes, type TeamRuntimeResumeHost } from "./team-runtime-restorer.js";

function sessionDocument(): TeamSessionDocument {
	return {
		schemaVersion: 1,
		revision: 0,
		id: "team-session",
		teamId: "team",
		name: "Team",
		cwd: "C:/workspace",
		orchestrationPolicyId: "leader-delegates-v1",
		contextPolicyId: "public-results-v1",
		leaderMemberId: "leader",
		memberHandles: { leader: "leader" },
		createdAt: 1,
		updatedAt: 1,
		events: [],
		memberRuntime: {
			leader: {
				sessionId: "old-runtime",
				sessionPath: "C:/sessions/leader.jsonl",
				agentProfileRevision: 1,
				deliveredEventIds: [],
			},
		},
	};
}

const logger = { info: vi.fn(), error: vi.fn() };

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

describe("restoreTeamMemberRuntimes", () => {
	it.each(["active", "pending"])(
		"preserves a same-path runtime borrowed from a caller with an %s creation when another member fails",
		async (state) => {
			const entered = deferred();
			const proceed = deferred();
			const runtime = new RuntimeHost({
				sessionBackend: {
					createAssembly: async (request) => {
						entered.resolve();
						await proceed.promise;
						return createTeamRuntimeTestAssembly("canonical-leader", request.sessionPath);
					},
				},
			});
			const session = sessionDocument();
			const expanded: TeamSessionDocument = {
				...session,
				memberRuntime: {
					...session.memberRuntime,
					reviewer: {
						...session.memberRuntime.leader!,
						sessionId: "old-reviewer",
						sessionPath: "C:/sessions/reviewer.jsonl",
					},
				},
			};
			const leaderPath = session.memberRuntime.leader!.sessionPath;
			const externalOpen = runtime.createSession({ sessionPath: leaderPath });
			await entered.promise;
			if (state === "active") {
				proceed.resolve();
				await externalOpen;
			}
			try {
				const restoring = restoreTeamMemberRuntimes({
					session: expanded,
					runtime,
					createRuntimeTools: () => [],
					resolveConfig: async ({ memberId, cwd, sessionPath }) => {
						if (memberId === "reviewer") throw new Error("reviewer config failed");
						return { config: { cwd, sessionPath }, agentProfileId: "agent", agentProfileRevision: 1 };
					},
					persist: async () => {},
					logger,
				});
				proceed.resolve();
				await expect(restoring).rejects.toThrow("reviewer config failed");
				await externalOpen;
				expect(runtime.getSessionPath("canonical-leader")).toBe(leaderPath);
			} finally {
				proceed.resolve();
				await runtime.close();
			}
			expect(runtime.getSessionPath("canonical-leader")).toBeUndefined();
		},
	);

	it("preserves a newly restored runtime adopted by another caller before the save fails", async () => {
		const runtime = new RuntimeHost({
			sessionBackend: {
				createAssembly: async (request) => createTeamRuntimeTestAssembly("canonical-leader", request.sessionPath),
			},
		});
		const session = sessionDocument();
		const leaderPath = session.memberRuntime.leader!.sessionPath;
		try {
			await expect(
				restoreTeamMemberRuntimes({
					session,
					runtime,
					createRuntimeTools: () => [],
					resolveConfig: async ({ cwd, sessionPath }) => ({
						config: { cwd, sessionPath },
						agentProfileId: "agent",
						agentProfileRevision: 1,
					}),
					persist: async () => {
						await runtime.createSession({ sessionPath: leaderPath });
						throw new Error("metadata write failed");
					},
					logger,
				}),
			).rejects.toThrow("metadata write failed");
			expect(runtime.getSessionPath("canonical-leader")).toBe(leaderPath);
		} finally {
			await runtime.close();
		}
		expect(runtime.getSessionPath("canonical-leader")).toBeUndefined();
	});

	it("reopens persisted member runtimes, reattaches tools and persists changed ids", async () => {
		const paths = new Map<string, string>();
		const createSession = vi.fn(async () => {
			paths.set("restored-runtime", "C:/sessions/leader.jsonl");
			return { sessionId: "restored-runtime" };
		});
		const runtime: TeamRuntimeResumeHost = {
			getSessionPath: (sessionId) => paths.get(sessionId),
			createSession,
			disposeSession: vi.fn(async () => undefined),
		};
		const persist = vi.fn(async () => undefined);
		const resolveConfig = vi.fn(async ({ memberId, sessionPath, runtimeTools }) => {
			expect(memberId).toBe("leader");
			expect(runtimeTools).toEqual(["delegate-tool"]);
			return {
				config: { cwd: "C:/workspace", sessionPath } satisfies SessionConfig,
				agentProfileId: "agent-leader",
				agentProfileRevision: 2,
			};
		});

		const restored = await restoreTeamMemberRuntimes({
			session: sessionDocument(),
			runtime,
			createRuntimeTools: () => ["delegate-tool"],
			resolveConfig,
			persist,
			now: () => 20,
			logger,
		});

		expect(restored.memberRuntime.leader).toMatchObject({
			sessionId: "restored-runtime",
			agentProfileId: "agent-leader",
			agentProfileRevision: 2,
		});
		expect(restored).toMatchObject({ revision: 1, updatedAt: 20 });
		expect(persist).toHaveBeenCalledWith(restored);
	});

	it("reuses an already active runtime without rewriting the document", async () => {
		const session = sessionDocument();
		const runtime: TeamRuntimeResumeHost = {
			getSessionPath: () => "C:/sessions/leader.jsonl",
			createSession: vi.fn(),
			disposeSession: vi.fn(),
		};
		const persist = vi.fn();

		await expect(
			restoreTeamMemberRuntimes({
				session,
				runtime,
				createRuntimeTools: () => ["delegate-tool"],
				resolveConfig: vi.fn(),
				persist,
				logger,
			}),
		).resolves.toBe(session);
		expect(runtime.createSession).not.toHaveBeenCalled();
		expect(persist).not.toHaveBeenCalled();
	});

	it("keeps the binding unchanged after a failed save and retries using the retained runtime", async () => {
		const original = sessionDocument();
		const session: TeamSessionDocument = {
			...original,
			memberRuntime: {
				...original.memberRuntime,
				reviewer: {
					...original.memberRuntime.leader!,
					sessionId: "active-reviewer",
					sessionPath: "C:/sessions/reviewer.jsonl",
				},
			},
		};
		const originalSnapshot = structuredClone(session);
		const paths = new Map([["active-reviewer", "C:/sessions/reviewer.jsonl"]]);
		let sequence = 0;
		const runtime: TeamRuntimeResumeHost = {
			getSessionPath: (id) => paths.get(id),
			createSession: async (config) => {
				const existing = [...paths].find(([, path]) => path === config.sessionPath);
				if (existing) return { sessionId: existing[0] };
				const sessionId = `restored-${++sequence}`;
				paths.set(sessionId, String(config.sessionPath));
				return { sessionId };
			},
			disposeSession: async (id) => {
				paths.delete(id);
			},
		};
		const saveError = new Error("metadata write failed");
		let persisted = session;
		const persist = vi.fn(async (next: TeamSessionDocument) => {
			persisted = structuredClone(next);
		});
		persist.mockRejectedValueOnce(saveError);
		const restore = (current: TeamSessionDocument) =>
			restoreTeamMemberRuntimes({
				session: current,
				runtime,
				createRuntimeTools: () => [],
				resolveConfig: async ({ cwd, sessionPath }) => ({
					config: { cwd, sessionPath },
					agentProfileId: "agent-leader",
					agentProfileRevision: 2,
				}),
				persist,
				logger,
			});

		await expect(restore(session)).rejects.toBe(saveError);
		expect([...paths]).toEqual([
			["active-reviewer", "C:/sessions/reviewer.jsonl"],
			["restored-1", "C:/sessions/leader.jsonl"],
		]);
		expect(persisted).toBe(session);
		expect(session).toEqual(originalSnapshot);

		const restored = await restore(persisted);
		expect(restored.memberRuntime.leader?.sessionId).toBe("restored-1");
		expect(persisted).toEqual(restored);
		expect(paths.size).toBe(2);
		await expect(restore(persisted)).resolves.toBe(persisted);
		expect(sequence).toBe(1);
	});

	it("retains opened runtimes without committing a partial binding when a later member fails", async () => {
		const session = sessionDocument();
		const secondPath = "C:/sessions/reviewer.jsonl";
		const expanded: TeamSessionDocument = {
			...session,
			memberHandles: { ...session.memberHandles, reviewer: "reviewer" },
			memberRuntime: {
				...session.memberRuntime,
				reviewer: {
					sessionId: "old-reviewer",
					sessionPath: secondPath,
					agentProfileRevision: 1,
					deliveredEventIds: [],
				},
			},
		};
		const paths = new Map<string, string>();
		const disposeSession = vi.fn(async () => undefined);
		const runtime: TeamRuntimeResumeHost = {
			getSessionPath: (id) => paths.get(id),
			createSession: vi.fn(async (config) => {
				if (config.sessionPath === secondPath) throw new Error("locked");
				paths.set("restored-leader", String(config.sessionPath));
				return { sessionId: "restored-leader" };
			}),
			disposeSession,
		};

		await expect(
			restoreTeamMemberRuntimes({
				session: expanded,
				runtime,
				createRuntimeTools: () => ["delegate-tool"],
				resolveConfig: async ({ cwd, memberId, sessionPath }) => ({
					config: { cwd, sessionPath },
					agentProfileId: `agent-${memberId}`,
					agentProfileRevision: 1,
				}),
				persist: vi.fn(),
				logger,
			}),
		).rejects.toThrow("locked");
		expect(disposeSession).not.toHaveBeenCalled();
		expect(paths.get("restored-leader")).toBe("C:/sessions/leader.jsonl");
	});

	it("restores independent missing member runtimes concurrently", async () => {
		const session = {
			...sessionDocument(),
			memberHandles: { leader: "leader", reviewer: "reviewer" },
			memberRuntime: {
				...sessionDocument().memberRuntime,
				reviewer: {
					sessionId: "old-reviewer",
					sessionPath: "C:/sessions/reviewer.jsonl",
					agentProfileRevision: 1,
					deliveredEventIds: [],
				},
			},
		};
		const paths = new Map<string, string>();
		let active = 0;
		let maxActive = 0;
		const runtime: TeamRuntimeResumeHost = {
			getSessionPath: (id) => paths.get(id),
			createSession: vi.fn(async (config) => {
				active += 1;
				maxActive = Math.max(maxActive, active);
				await Promise.resolve();
				const id = `restored-${active}`;
				paths.set(id, String(config.sessionPath));
				active -= 1;
				return { sessionId: id };
			}),
			disposeSession: vi.fn(async () => undefined),
		};

		await restoreTeamMemberRuntimes({
			session,
			runtime,
			createRuntimeTools: () => [],
			resolveConfig: async ({ cwd, sessionPath }) => ({
				config: { cwd, sessionPath },
				agentProfileId: "agent",
				agentProfileRevision: 1,
			}),
			persist: vi.fn(async () => undefined),
			logger,
		});

		expect(maxActive).toBe(2);
	});
});
