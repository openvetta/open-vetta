import { createAgentTeamFixture, parseTeamSessionDocument, type TeamSessionDocument } from "@vetta/agent-team";
import { RuntimeHost, type SessionConfig } from "@vetta/runtime-core";
import {
	applyConversationDocumentCommand,
	type ConversationDocument,
	createEmptyConversationDocument,
} from "@vetta/runtime-core/conversation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationOwnershipCatalogPort } from "../conversations/conversation-ownership-catalog.js";
import { registerPresetPluginBlueprints } from "./preset-plugin-blueprints.testing.js";
import { TeamCollaborationStore } from "./team-collaboration-store.js";
import { createTeamRuntimeTestAssembly } from "./team-runtime-host.testing.js";
import { TeamRuntimeManager } from "./team-runtime-manager.js";
import { TeamSessionStateRepository } from "./team-session-state-repository.js";

vi.mock("../conversations/resolve-session-config.js", () => ({
	resolveDesktopSessionConfig: vi.fn(async (config: SessionConfig) => ({ config })),
}));
vi.mock("../logger.js", () => ({
	getAppLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

function createHarness(host?: RuntimeHost) {
	const paths = new Map<string, string>();
	const persistedPaths = new Map<string, string>();
	const documents = new Map<string, ConversationDocument>();
	let sequence = 0;
	const readSessionDocument = (id: string) => {
		if (!paths.has(id)) throw new Error(`Runtime is not active: ${id}`);
		const document = documents.get(id);
		if (!document) throw new Error(`Conversation is missing: ${id}`);
		return document;
	};
	const runtime = {
		createSession: vi.fn(async (config: SessionConfig = {}) => {
			const sessionId =
				config.sessionId ??
				[...persistedPaths].find(([, path]) => config.sessionPath === path)?.[0] ??
				`runtime-${++sequence}`;
			paths.set(sessionId, config.sessionPath ?? `C:/sessions/${sessionId}.jsonl`);
			persistedPaths.set(sessionId, paths.get(sessionId)!);
			if (!documents.has(sessionId)) {
				documents.set(sessionId, createEmptyConversationDocument({ sessionId, createdAt: 1 }));
			}
			return { sessionId };
		}),
		getSessionPath: vi.fn((id: string) => paths.get(id)),
		disposeSession: vi.fn(async (id: string) => {
			paths.delete(id);
		}),
		readSessionActiveToolNames: vi.fn(() => ["read", "spawn_agent"]),
		setSessionActiveToolNames: vi.fn(),
		readSessionDocument,
		appendSessionMetadataEntry: vi.fn(async (id: string, customType: string, data?: unknown) => {
			const document = readSessionDocument(id);
			documents.set(
				id,
				applyConversationDocumentCommand(document, {
					type: "custom.append",
					entryId: `metadata-${document.revision + 1}`,
					customType,
					data,
					timestamp: "2026-01-01T00:00:00Z",
				}).document,
			);
		}),
	} satisfies Partial<RuntimeHost>;
	const ownershipCatalog: ConversationOwnershipCatalogPort = {
		register: vi.fn(async () => undefined),
		listByTeam: async () => [],
		getOwner: async () => undefined,
		filterUserSessions: async (sessions) => [...sessions],
	};
	const sessionState = new TeamSessionStateRepository({
		runtime: () => host ?? (runtime as unknown as RuntimeHost),
		ownershipCatalog,
	});
	const manager = new TeamRuntimeManager({
		runtime: () => host ?? (runtime as unknown as RuntimeHost),
		createTeamToolRegistrations: () => [],
		sessionState,
		collaborationStore: new TeamCollaborationStore(host ?? runtime),
	});
	const document = createAgentTeamFixture();
	const team = document.teams[0]!;
	const session: TeamSessionDocument = {
		schemaVersion: 1,
		revision: 0,
		id: "team-session",
		teamId: team.id,
		name: team.name,
		cwd: "C:/workspace",
		orchestrationPolicyId: team.orchestrationPolicyId,
		contextPolicyId: team.contextPolicyId,
		leaderMemberId: team.leaderMemberId,
		activeMemberIds: team.members.map((member) => member.id),
		memberHandles: Object.fromEntries(team.members.map((member) => [member.id, member.handle])),
		createdAt: 1,
		updatedAt: 1,
		runtimeStatus: "preparing",
		events: [],
		memberRuntime: {},
	};
	return { manager, runtime, paths, documents, sessionState, ownershipCatalog, document, team, session };
}

describe("TeamRuntimeManager acquisition", () => {
	beforeEach(() => registerPresetPluginBlueprints());

	it.each(["member", "coordination"])(
		"releases an exclusively new %s runtime through the real host on validation failure",
		async (kind) => {
			const host = new RuntimeHost({
				sessionBackend: { createAssembly: async () => createTeamRuntimeTestAssembly("team-session", undefined) },
			});
			const { manager, session, team, document } = createHarness(host);
			try {
				const creation =
					kind === "member"
						? manager.createMemberRuntime(
								session.id,
								team.members[0]!,
								team,
								document,
								session.cwd,
								"full-access",
							)
						: manager.createCoordinationRuntime(session.cwd, undefined, session.id);
				await expect(creation).rejects.toThrow(`Runtime did not expose team ${kind} session path`);
				expect(() => host.getState(session.id)).toThrow("Session not found");
			} finally {
				await host.close();
			}
		},
	);

	it("does not release another caller's same-path coordination runtime when its canonical identity differs", async () => {
		const path = "C:/sessions/coordination.jsonl";
		const host = new RuntimeHost({
			sessionBackend: { createAssembly: async () => createTeamRuntimeTestAssembly("canonical-coordination", path) },
		});
		const { manager, session } = createHarness(host);
		try {
			await host.createSession({ sessionPath: path });
			await expect(manager.createCoordinationRuntime(session.cwd, path, "old-coordination")).rejects.toThrow(
				"Restored team coordination session identity changed",
			);
			expect(host.getSessionPath("canonical-coordination")).toBe(path);
		} finally {
			await host.close();
		}
		expect(host.getSessionPath("canonical-coordination")).toBeUndefined();
	});

	it.each(["missing path", "tool policy"])("releases a new member when %s validation fails", async (failure) => {
		const { manager, runtime, paths, document, team, session } = createHarness();
		if (failure === "missing path") runtime.getSessionPath.mockReturnValue(undefined);
		else
			runtime.setSessionActiveToolNames.mockImplementation(() => {
				throw new Error("tool policy failed");
			});

		await expect(
			manager.createMemberRuntime(session.id, team.members[0]!, team, document, session.cwd, "full-access"),
		).rejects.toThrow(
			failure === "missing path" ? "Runtime did not expose team member session path" : "tool policy failed",
		);
		expect(paths.size).toBe(0);
	});

	it("releases a new coordination runtime when its path is unavailable", async () => {
		const { manager, runtime, paths } = createHarness();
		runtime.getSessionPath.mockReturnValue(undefined);

		await expect(manager.createCoordinationRuntime("C:/workspace", undefined, "team-session")).rejects.toThrow(
			"Runtime did not expose team coordination session path",
		);
		expect(paths.size).toBe(0);
	});

	it("retains the identity failure when coordination cleanup also fails", async () => {
		const { manager, runtime } = createHarness();
		runtime.createSession.mockResolvedValue({ sessionId: "unexpected-runtime" });
		runtime.disposeSession.mockRejectedValue(new Error("cleanup failed"));

		await expect(manager.createCoordinationRuntime("C:/workspace", undefined, "team-session")).rejects.toThrow(
			"Restored team coordination session identity changed",
		);
	});

	it("preserves an already active coordination runtime when a conflicting path is requested", async () => {
		const { manager, runtime, paths } = createHarness();
		await runtime.createSession({ sessionId: "team-session", sessionPath: "C:/sessions/original.jsonl" });
		runtime.createSession.mockResolvedValue({ sessionId: "team-session" });

		await expect(
			manager.createCoordinationRuntime("C:/workspace", "C:/sessions/other.jsonl", "team-session"),
		).rejects.toThrow("Restored team coordination session path changed");
		expect(paths.get("team-session")).toBe("C:/sessions/original.jsonl");
	});

	it("keeps an uncommitted coordination runtime host-owned when its metadata write fails", async () => {
		const { manager, runtime, paths, sessionState, session } = createHarness();
		const saveError = new Error("metadata write failed");
		runtime.appendSessionMetadataEntry.mockRejectedValueOnce(saveError);

		await expect(manager.ensureCoordinationRuntime(session)).rejects.toBe(saveError);
		expect(paths.get(session.id)).toBe(`C:/sessions/${session.id}.jsonl`);
		expect(sessionState.get(session.id)).toBeUndefined();
		expect(runtime.disposeSession).not.toHaveBeenCalled();
	});

	it.each([false, true])(
		"retries an initial coordination write using the acquired path (host released=%s)",
		async (released) => {
			const sessionId = "team-session";
			const path = "C:/sessions/coordination.jsonl";
			let document = createEmptyConversationDocument({ sessionId, createdAt: 1 });
			let failWrite = true;
			let creations = 0;
			const saveError = new Error("initial metadata write failed");
			const host = new RuntimeHost({
				sessionBackend: {
					createAssembly: async (request) => {
						creations += 1;
						if (creations > 1 && request.sessionPath !== path) {
							throw new Error("Existing Conversation requires its persisted path");
						}
						return {
							...createTeamRuntimeTestAssembly(sessionId, path),
							conversationView: { readDocument: () => document },
							metadataController: {
								appendEntry: async (customType, data) => {
									if (failWrite) {
										failWrite = false;
										throw saveError;
									}
									document = applyConversationDocumentCommand(document, {
										type: "custom.append",
										entryId: `metadata-${document.revision + 1}`,
										customType,
										data,
										timestamp: "2026-01-01T00:00:00Z",
									}).document;
								},
								readName: () => undefined,
								setName: async () => {},
								setLabel: async () => {},
							},
						};
					},
				},
			});
			const { manager, session, sessionState } = createHarness(host);
			try {
				await expect(manager.ensureCoordinationRuntime(session)).rejects.toBe(saveError);
				expect(document.entries).toHaveLength(0);
				expect(sessionState.get(session.id)).toBeUndefined();
				if (released) await host.disposeSession(sessionId);

				const restored = await manager.ensureCoordinationRuntime(session);
				expect(restored.coordinationRuntime).toEqual({ sessionId, sessionPath: path });
				expect(sessionState.get(session.id)).toEqual(restored);
				expect(document.entries).toHaveLength(1);
				await expect(manager.ensureCoordinationRuntime(restored)).resolves.toBe(restored);
				expect(creations).toBe(released ? 2 : 1);
			} finally {
				await host.close();
			}
			expect(host.getSessionPath(sessionId)).toBeUndefined();
		},
	);

	it("preserves a new coordination runtime borrowed from durable metadata before ownership registration fails", async () => {
		const sessionId = "team-session";
		const path = "C:/sessions/coordination.jsonl";
		let document = createEmptyConversationDocument({ sessionId, createdAt: 1 });
		const saveError = new Error("catalog write failed after another caller resumed");
		const host = new RuntimeHost({
			sessionBackend: {
				createAssembly: async () => ({
					...createTeamRuntimeTestAssembly(sessionId, path),
					conversationView: { readDocument: () => document },
					metadataController: {
						appendEntry: async (customType, data) => {
							document = applyConversationDocumentCommand(document, {
								type: "custom.append",
								entryId: `metadata-${document.revision + 1}`,
								customType,
								data,
								timestamp: "2026-01-01T00:00:00Z",
							}).document;
						},
						readName: () => undefined,
						setName: async () => {},
						setLabel: async () => {},
					},
				}),
			},
		});
		const { manager, session, sessionState, ownershipCatalog } = createHarness(host);
		vi.mocked(ownershipCatalog.register).mockImplementationOnce(async () => {
			const entry = document.entries.at(-1);
			if (entry?.type !== "custom" || typeof entry.data !== "object" || !entry.data || !("session" in entry.data)) {
				throw new Error("Persisted Team state is missing");
			}
			const persisted = parseTeamSessionDocument(entry.data.session);
			const sessionPath = persisted.coordinationRuntime?.sessionPath;
			if (!sessionPath) throw new Error("Persisted coordination path is missing");
			await host.createSession({ sessionPath });
			throw saveError;
		});
		try {
			await expect(manager.ensureCoordinationRuntime(session)).rejects.toBe(saveError);
			expect(host.getSessionPath(sessionId)).toBe(path);
			expect(sessionState.get(session.id)).toBeUndefined();
		} finally {
			await host.close();
		}
		expect(host.getSessionPath(sessionId)).toBeUndefined();
	});

	it("can reopen durable coordination metadata after ownership registration fails and the host releases its runtime", async () => {
		const { manager, runtime, paths, documents, sessionState, ownershipCatalog, session } = createHarness();
		vi.mocked(ownershipCatalog.register).mockRejectedValueOnce(new Error("catalog write failed"));

		await expect(manager.ensureCoordinationRuntime(session)).rejects.toThrow("catalog write failed");
		expect(paths.size).toBe(1);
		expect(sessionState.get(session.id)).toBeUndefined();
		const entry = documents.get(session.id)?.entries.at(-1);
		if (entry?.type !== "custom" || typeof entry.data !== "object" || !entry.data || !("session" in entry.data)) {
			throw new Error("Persisted Team state is missing");
		}
		const persisted = parseTeamSessionDocument(entry.data.session);
		await runtime.disposeSession(session.id);
		const restored = await manager.ensureCoordinationRuntime(persisted);
		expect(restored.coordinationRuntime).toEqual(persisted.coordinationRuntime);
		expect(paths.size).toBe(1);
		expect(sessionState.get(session.id)).toEqual(restored);
	});

	it("creates a configured member, persists it and reuses its live runtime when reopening", async () => {
		const { manager, runtime, paths, sessionState, document, team, session } = createHarness();
		const coordinated = await manager.ensureCoordinationRuntime(session);
		const member = team.members[0]!;
		const memberRuntime = await manager.createMemberRuntime(
			session.id,
			member,
			team,
			document,
			session.cwd,
			"full-access",
		);
		const ready = { ...coordinated, memberRuntime: { [member.id]: memberRuntime } };
		await sessionState.persist(ready);

		const restored = await manager.restoreMembers(ready, document);
		expect(restored).toBe(ready);
		expect(paths.size).toBe(2);
		expect(runtime.setSessionActiveToolNames).toHaveBeenCalledWith(memberRuntime.sessionId, ["read"]);
		expect(runtime.createSession).toHaveBeenCalledTimes(2);
		expect(sessionState.get(session.id)).toEqual(ready);
	});

	it.each([true, false])(
		"does not adopt a restored member until its tool policy succeeds (profile changed=%s)",
		async (profileChanged) => {
			const { manager, runtime, paths, sessionState, document, team, session } = createHarness();
			const coordinated = await manager.ensureCoordinationRuntime(session);
			const member = team.members[0]!;
			const memberRuntime = await manager.createMemberRuntime(
				session.id,
				member,
				team,
				document,
				session.cwd,
				"full-access",
			);
			const saved = {
				...coordinated,
				memberRuntime: {
					[member.id]: {
						...memberRuntime,
						agentProfileRevision: profileChanged ? 0 : memberRuntime.agentProfileRevision,
					},
				},
			};
			await sessionState.persist(saved);
			await runtime.disposeSession(memberRuntime.sessionId);
			const policyError = new Error("tool policy failed");
			runtime.setSessionActiveToolNames.mockImplementationOnce(() => {
				throw policyError;
			});

			await expect(manager.restoreMembers(saved, document)).rejects.toBe(policyError);
			expect(paths.get(memberRuntime.sessionId)).toBe(memberRuntime.sessionPath);
			expect(sessionState.get(session.id)).toEqual(saved);
			const resumed = await manager.restoreMembers(saved, document);
			const restored = await manager.ensureMemberConfiguration(resumed, document, member.id);
			expect(restored.memberRuntime[member.id]).toEqual(memberRuntime);
			expect(paths.size).toBe(2);
		},
	);

	it("keeps the saved configuration retryable when preparing the replacement runtime fails", async () => {
		const { manager, runtime, paths, sessionState, document, team, session } = createHarness();
		const coordinated = await manager.ensureCoordinationRuntime(session);
		const member = team.members[0]!;
		const memberRuntime = await manager.createMemberRuntime(
			session.id,
			member,
			team,
			document,
			session.cwd,
			"full-access",
		);
		const saved = {
			...coordinated,
			memberRuntime: { [member.id]: { ...memberRuntime, agentProfileRevision: 0 } },
		};
		await sessionState.persist(saved);
		const policyError = new Error("replacement tool policy failed");
		runtime.setSessionActiveToolNames.mockImplementationOnce(() => {
			throw policyError;
		});

		await expect(manager.ensureMemberConfiguration(saved, document, member.id)).rejects.toBe(policyError);
		expect(paths.get(memberRuntime.sessionId)).toBe(memberRuntime.sessionPath);
		expect(sessionState.get(session.id)).toEqual(saved);
		const restored = await manager.ensureMemberConfiguration(saved, document, member.id);
		expect(restored.memberRuntime[member.id]).toEqual(memberRuntime);
		expect(sessionState.get(session.id)).toEqual(restored);
	});
});
