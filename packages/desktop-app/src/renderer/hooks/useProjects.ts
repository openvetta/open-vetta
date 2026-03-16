import { useAtom } from "jotai";
import { useCallback } from "react";
import { expandedProjectsAtom, projectsAtom, type SessionInfo, sessionsMapAtom } from "../store/atoms";

// Module-level flag so auto-expand only happens once per app session
let didAutoExpand = false;

export function useProjects() {
	const [projects, setProjects] = useAtom(projectsAtom);
	const [sessionsMap, setSessionsMap] = useAtom(sessionsMapAtom);
	const [expandedProjects, setExpandedProjects] = useAtom(expandedProjectsAtom);

	const loadSessions = useCallback(
		async (cwd: string) => {
			const sessions = await window.vetta.session.listSessions(cwd);
			setSessionsMap((prev) => new Map([...prev, [cwd, sessions as SessionInfo[]]]));
		},
		[setSessionsMap],
	);

	const refreshProjects = useCallback(async () => {
		const discovered = await window.vetta.session.listProjects();
		const saved = JSON.parse(localStorage.getItem("desktop-projects") ?? "[]") as string[];
		const merged = new Map<string, number>();
		for (const p of discovered) merged.set(p.cwd, p.sessionCount);
		for (const cwd of saved) if (!merged.has(cwd)) merged.set(cwd, 0);
		const next = Array.from(merged.entries()).map(([cwd, sessionCount]) => ({ cwd, sessionCount }));
		setProjects(next);

		if (!didAutoExpand && next.length > 0) {
			didAutoExpand = true;
			setExpandedProjects(new Set<string>([next[0].cwd]));
			await loadSessions(next[0].cwd);
		}
	}, [setProjects, setExpandedProjects, loadSessions]);

	const addProject = useCallback(async () => {
		const cwd = await window.vetta.dialog.selectFolder();
		if (!cwd) return null;
		const saved = JSON.parse(localStorage.getItem("desktop-projects") ?? "[]") as string[];
		localStorage.setItem("desktop-projects", JSON.stringify([...new Set([...saved, cwd])]));
		await refreshProjects();
		setExpandedProjects((prev) => new Set([...prev, cwd]));
		await loadSessions(cwd);
		return cwd;
	}, [refreshProjects, setExpandedProjects, loadSessions]);

	const toggleProject = useCallback(
		(cwd: string) => {
			setExpandedProjects((prev) => {
				const next = new Set(prev);
				if (next.has(cwd)) {
					next.delete(cwd);
				} else {
					next.add(cwd);
					void loadSessions(cwd);
				}
				return next;
			});
		},
		[setExpandedProjects, loadSessions],
	);

	const deleteSession = useCallback(
		async (cwd: string, sessionPath: string) => {
			await window.vetta.session.delete(sessionPath);
			setSessionsMap((prev) => {
				const next = new Map(prev);
				const sessions = next.get(cwd);
				if (sessions) {
					next.set(
						cwd,
						sessions.filter((s) => s.path !== sessionPath),
					);
				}
				return next;
			});
		},
		[setSessionsMap],
	);

	const renameSession = useCallback(
		async (cwd: string, sessionPath: string, name: string) => {
			await window.vetta.session.rename(sessionPath, name);
			setSessionsMap((prev) => {
				const next = new Map(prev);
				const sessions = next.get(cwd);
				if (sessions) {
					next.set(
						cwd,
						sessions.map((s) => (s.path === sessionPath ? { ...s, name } : s)),
					);
				}
				return next;
			});
		},
		[setSessionsMap],
	);

	return {
		projects,
		sessionsMap,
		expandedProjects,
		refreshProjects,
		loadSessions,
		addProject,
		toggleProject,
		deleteSession,
		renameSession,
	};
}
