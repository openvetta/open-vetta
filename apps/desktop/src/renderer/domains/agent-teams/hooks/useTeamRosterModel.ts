import type { TeamDefinition } from "@vetta/agent-team";
import { useCallback, useMemo } from "react";
import { buildCreateTeamInput, buildUpdateTeamInput, type TeamAssemblyDraft } from "../lib/team-assembly";
import { type AgentTeamResources, agentTeamErrorMessage } from "./useAgentTeamResources";

/** 团队编队的读写；智能体本身的编辑由 `useAgentLibraryModel` 负责。 */
export function useTeamRosterModel(resources: AgentTeamResources) {
	const { document, setDocument, setError, reload } = resources;
	const teams = useMemo(() => document?.teams ?? [], [document]);
	// 阵容还包含仅属于团队的副本；智能体库的筛选不能成为成员身份的事实源。
	const agentsById = useMemo(() => new Map(document?.agents.map((agent) => [agent.id, agent]) ?? []), [document]);

	const saveAssembly = useCallback(
		async (draft: TeamAssemblyDraft): Promise<TeamDefinition | undefined> => {
			const existing = draft.teamId ? teams.find((team) => team.id === draft.teamId) : undefined;
			try {
				const saved = existing
					? await window.vetta.agentTeams.updateTeam(
							existing.id,
							buildUpdateTeamInput(draft, existing, agentsById),
						)
					: await window.vetta.agentTeams.createTeam(buildCreateTeamInput(draft, agentsById));
				setDocument((current) =>
					current
						? {
								...current,
								teams: existing
									? current.teams.map((team) => (team.id === saved.id ? saved : team))
									: [saved, ...current.teams],
							}
						: current,
				);
				setError(undefined);
				// copy 的 Profile ID 由主进程生成，保存返回的 Team 不含其档案。
				// 同步完整配置，才能立即显示新副本并移除已删除的副本。
				if (
					saved.members.some((member) => member.binding.kind === "copy") ||
					existing?.members.some((member) => member.binding.kind === "copy")
				) {
					await reload();
				}
				return saved;
			} catch (cause) {
				setError(agentTeamErrorMessage(cause));
				return undefined;
			}
		},
		[agentsById, reload, setDocument, setError, teams],
	);

	const deleteTeam = useCallback(
		async (team: TeamDefinition): Promise<boolean> => {
			try {
				await window.vetta.agentTeams.deleteTeam(team.id, { expectedRevision: team.revision });
				await reload();
				return true;
			} catch (cause) {
				setError(agentTeamErrorMessage(cause));
				return false;
			}
		},
		[reload, setError],
	);

	return { teams, agentsById, actions: { saveAssembly, deleteTeam } };
}
