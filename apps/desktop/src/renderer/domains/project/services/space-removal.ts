import { notifyTeamSessionsChanged } from "@shared/agent-teams/team-session-events";
import type { spacesAtom } from "@shared/store/spaces";
import { spaceOf } from "@shared/store/spaces";
import type { ExtractAtomValue } from "jotai";
import type { DesktopTeamSidebarConversation } from "@/shared/sidebar-conversation";

export async function readSpaceRemoval(state: ExtractAtomValue<typeof spacesAtom>, id: string, cwd: string) {
	const [config, sessions, teams] = await Promise.all([
		window.vetta.config.get(),
		cwd ? window.vetta.session.listSessions(cwd) : Promise.resolve([]),
		window.vetta.agentTeams.listSidebarConversations(),
	]);
	const projectInSpace = (project: { path: string }) => spaceOf(state, { kind: "project", key: project.path }) === id;
	const teamSessions = teams.filter(
		(team) =>
			team.placement.kind === "default" && spaceOf(state, { kind: "conversation", key: team.teamSessionId }) === id,
	);
	const allTeamPaths = new Set(teams.map((team) => team.coordinationSessionPath));
	return {
		projects: config.projects.filter(projectInSpace),
		archived: config.archivedProjects.filter(projectInSpace),
		sessions: sessions.filter(
			(session) =>
				!allTeamPaths.has(session.path) && spaceOf(state, { kind: "conversation", key: session.path }) === id,
		),
		teamSessions,
	};
}

export type SpaceRemovalContents = Awaited<ReturnType<typeof readSpaceRemoval>>;

export async function runningSpaceConversations(contents: SpaceRemovalContents): Promise<string[]> {
	const [paths, teams] = await Promise.all([
		window.vetta.session.listRunning(),
		Promise.all(
			contents.teamSessions.map(async (session) => ({
				session,
				snapshot: await window.vetta.agentTeams.getSession({
					id: session.teamSessionId,
					coordinationSessionPath: session.coordinationSessionPath,
				}),
			})),
		),
	]);
	const running = new Set(paths);
	return [
		...contents.sessions
			.filter((session) => running.has(session.path))
			.map((session) => session.name || session.firstMessage || session.path),
		...teams
			.filter(
				({ session, snapshot }) =>
					running.has(session.coordinationSessionPath) || snapshot.display?.workingMemberIds?.length,
			)
			.map(({ session }) => session.sessionTitle),
	];
}

export async function deleteSpaceTeamSession(session: DesktopTeamSidebarConversation): Promise<void> {
	await window.vetta.agentTeams.deleteSession(
		{
			id: session.teamSessionId,
			coordinationSessionPath: session.coordinationSessionPath,
		},
		"workspace-removal",
	);
	notifyTeamSessionsChanged(session.teamId);
}
