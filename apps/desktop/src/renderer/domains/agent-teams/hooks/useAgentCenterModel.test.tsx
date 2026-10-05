// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { AGENT_TEAM_SCHEMA_VERSION, type AgentTeamDocument, type TeamDefinition } from "@vetta/agent-team";
import { describe, expect, it, vi } from "vitest";
import { AgentTeamStore } from "../../../../main/agent-teams/agent-team-store";
import { assemblyDraftFromTeam } from "../lib/team-assembly";
import { useAgentCenterModel } from "./useAgentCenterModel";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock("../services/load-agent-team-resources", () => ({
	loadAgentTeamConfigurationResources: mocks.load,
}));

vi.mock("../../../../main/logger", () => ({
	getAppLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const leader = {
	id: "designer",
	revision: 1,
	name: "设计师",
	description: "",
	mentionHandle: "designer",
	blueprintId: "plugin:vetta-ui-design:designer",
	abilities: { selectionMode: "all", skills: [], mcpServers: [], plugins: [] },
	scope: { kind: "library" },
	createdAt: 1,
	updatedAt: 1,
} as const;

function team(id: string, source?: TeamDefinition["source"]): TeamDefinition {
	return {
		id,
		revision: 1,
		name: id,
		description: "",
		leaderMemberId: `${id}:leader`,
		members: [{ id: `${id}:leader`, handle: "designer", binding: { kind: "reference", agentProfileId: leader.id } }],
		orchestrationPolicyId: "leader-delegates-v1",
		contextPolicyId: "public-results-v1",
		...(source ? { source } : {}),
		createdAt: 1,
		updatedAt: 1,
	};
}

describe("useAgentCenterModel", () => {
	it.each(["copy", "reference"] as const)(
		"keeps a %s member visible and retained through saving, reopening and renaming a team",
		async (bindingKind) => {
			const recruit = { ...leader, id: "reviewer", name: "Reviewer", mentionHandle: "reviewer" };
			let persisted: AgentTeamDocument = {
				schemaVersion: AGENT_TEAM_SCHEMA_VERSION,
				revision: 1,
				agents: [leader, recruit],
				teams: [],
			};
			let nextId = 0;
			const store = new AgentTeamStore({
				repository: {
					read: async () => structuredClone(persisted),
					write: async (document) => {
						persisted = structuredClone(document);
					},
				},
				createId: () => `created-${++nextId}`,
				now: () => 10,
			});
			mocks.load.mockImplementation(async () => ({
				document: await store.read(),
				blueprints: [],
				plugins: [],
				capabilities: [],
			}));
			Object.defineProperty(window, "vetta", {
				configurable: true,
				value: {
					agentTeams: {
						list: () => store.read(),
						createTeam: store.createTeam.bind(store),
						updateTeam: store.updateTeam.bind(store),
						onChanged: () => () => {},
					},
				},
			});
			const renderModel = () => renderHook(() => useAgentCenterModel({ defaultName: "", defaultDescription: "" }));
			const first = renderModel();
			await waitFor(() => expect(first.result.current.loading).toBe(false));
			act(() => first.result.current.actions.startCreateTeam());
			act(() => {
				first.result.current.actions.renameAssembly("Delivery");
				first.result.current.actions.recruitAgent(leader);
			});
			await act(async () => {
				await first.result.current.actions.submitAssembly();
			});
			const created = first.result.current.teams[0];
			expect(created?.members).toHaveLength(1);
			await act(async () => {
				await first.result.current.actions.saveTeam({
					...assemblyDraftFromTeam(created),
					memberIds: [leader.id, recruit.id],
					bindingKinds: { [recruit.id]: bindingKind },
					assignments: { [recruit.id]: { responsibility: "Reviews delivery" } },
				});
			});
			const saved = first.result.current.teams[0];
			const member = saved.members[1];
			expect(member.binding.kind).toBe(bindingKind);
			expect(first.result.current.agentsById.get(member.binding.agentProfileId)?.name).toBe("Reviewer");
			expect(first.result.current.findAgent(member.binding.agentProfileId)?.id).toBe(member.binding.agentProfileId);
			// Team-only copies remain accessible from their roster, without entering the shared agent library.
			expect(first.result.current.agents.map((agent) => agent.id)).toEqual([leader.id, recruit.id]);
			first.unmount();

			const reopened = renderModel();
			await waitFor(() => expect(reopened.result.current.loading).toBe(false));
			expect(reopened.result.current.agentsById.get(member.binding.agentProfileId)?.name).toBe("Reviewer");
			await act(async () => {
				await reopened.result.current.actions.saveTeam({
					...assemblyDraftFromTeam(reopened.result.current.teams[0]),
					name: "Renamed delivery",
					description: "Keeps every member",
				});
			});
			expect(reopened.result.current.error).toBeUndefined();
			expect(persisted.teams[0]).toMatchObject({
				name: "Renamed delivery",
				description: "Keeps every member",
				leaderMemberId: saved.leaderMemberId,
				members: saved.members,
			});
			expect(persisted.agents.find((agent) => agent.id === member.binding.agentProfileId)).toBeDefined();
			expect(reopened.result.current.findAgent(member.binding.agentProfileId)?.name).toBe("Reviewer");
		},
	);

	it("selects a plugin team without entering member recruiting, and still recruits for a user team", async () => {
		const pluginTeam = team("design-team", { kind: "plugin", pluginId: "vetta-ui-design" });
		const userTeam = team("my-team");
		const document = { schemaVersion: 1, revision: 1, agents: [leader], teams: [pluginTeam, userTeam] };
		mocks.load.mockResolvedValue({
			document: document as unknown as AgentTeamDocument,
			blueprints: [],
			plugins: [],
			capabilities: [],
		});
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: { agentTeams: { list: vi.fn(), onChanged: () => () => {} } },
		});

		const { result } = renderHook(() => useAgentCenterModel({ defaultName: "", defaultDescription: "" }));
		await waitFor(() => expect(result.current.teams).toHaveLength(2));

		// 预设团队的阵容由插件清单说了算：点开它只是选中，不能进入拉拢/移出成员的草稿态。
		act(() => result.current.actions.startEditTeam(pluginTeam));
		expect(result.current.selectedTeam?.id).toBe("design-team");
		expect(result.current.assembly).toBeUndefined();

		act(() => result.current.actions.startEditTeam(userTeam));
		expect(result.current.selectedTeam?.id).toBe("my-team");
		expect(result.current.assembly?.memberIds).toEqual([leader.id]);
	});
});
