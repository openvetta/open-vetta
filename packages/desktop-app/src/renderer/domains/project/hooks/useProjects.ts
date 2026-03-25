import {
	expandedProjectsAtom,
	projectsAtom,
	type SessionInfo,
	sessionsMapAtom,
	workspacePathAtom,
} from "@shared/store/atoms";
import { useAtom, useAtomValue } from "jotai";
import { useCallback } from "react";

// Module-level flag so auto-expand only happens once per app session
let didAutoExpand = false;

export function useProjects() {
	const [projects, setProjects] = useAtom(projectsAtom);
	const [sessionsMap, setSessionsMap] = useAtom(sessionsMapAtom);
	const [expandedProjects, setExpandedProjects] = useAtom(expandedProjectsAtom);
	const workspacePath = useAtomValue(workspacePathAtom);

	const loadSessions = useCallback(
		async (cwd: string) => {
			const sessions = await window.vetta.session.listSessions(cwd);
			setSessionsMap((prev) => new Map([...prev, [cwd, sessions as SessionInfo[]]]));
		},
		[setSessionsMap],
	);

	const refreshProjects = useCallback(async () => {
		// Read project list from app-specific config file (not shared with CLI)
		const config = await window.vetta.config.get();
		const next = config.projects.map((cwd) => ({ cwd, sessionCount: 0 }));
		setProjects(next);

		// Load sessions for each project
		for (const project of next) {
			void loadSessions(project.cwd);
		}

		if (!didAutoExpand && next.length > 0) {
			didAutoExpand = true;
			setExpandedProjects(new Set<string>([next[0].cwd]));
			await loadSessions(next[0].cwd);
		}
	}, [setProjects, setExpandedProjects, loadSessions]);

	/** Create a new project directory in workspace and add to config */
	const createProject = useCallback(
		async (name: string) => {
			const projectPath = `${workspacePath}/${name}`;
			await window.vetta.fs.createDirectory(projectPath);
			// Read the resolved path back via listSubDirs to get the absolute path
			const subDirs = await window.vetta.fs.listSubDirs(workspacePath);
			const created = subDirs.find((d) => d.name === name);
			const resolvedPath = created?.path ?? projectPath;

			// Add to config
			const config = await window.vetta.config.get();
			if (!config.projects.includes(resolvedPath)) {
				config.projects.push(resolvedPath);
				await window.vetta.config.set({ projects: config.projects });
			}

			await refreshProjects();
			setExpandedProjects((prev) => new Set([...prev, resolvedPath]));
		},
		[workspacePath, refreshProjects, setExpandedProjects],
	);

	/** Open an existing directory and add to config */
	const openProject = useCallback(async () => {
		const cwd = await window.vetta.dialog.selectFolder();
		if (!cwd) return null;

		const config = await window.vetta.config.get();
		if (!config.projects.includes(cwd)) {
			config.projects.push(cwd);
			await window.vetta.config.set({ projects: config.projects });
		}

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

	const removeProject = useCallback(
		async (cwd: string) => {
			const config = await window.vetta.config.get();
			config.projects = config.projects.filter((p) => p !== cwd);
			await window.vetta.config.set({ projects: config.projects });
			await refreshProjects();
		},
		[refreshProjects],
	);

	const archiveProject = useCallback(
		async (cwd: string) => {
			const config = await window.vetta.config.get();
			config.projects = config.projects.filter((p) => p !== cwd);
			const archived = config.archivedProjects ?? [];
			if (!archived.includes(cwd)) archived.push(cwd);
			await window.vetta.config.set({ projects: config.projects, archivedProjects: archived });
			await refreshProjects();
		},
		[refreshProjects],
	);

	const unarchiveProject = useCallback(
		async (cwd: string) => {
			const config = await window.vetta.config.get();
			const archived = (config.archivedProjects ?? []).filter((p) => p !== cwd);
			const projects = config.projects.includes(cwd) ? config.projects : [...config.projects, cwd];
			await window.vetta.config.set({ projects, archivedProjects: archived });
			await refreshProjects();
		},
		[refreshProjects],
	);

	const deleteArchivedProject = useCallback(async (cwd: string) => {
		const config = await window.vetta.config.get();
		const archived = (config.archivedProjects ?? []).filter((p) => p !== cwd);
		await window.vetta.config.set({ archivedProjects: archived });
	}, []);

	/** Remove project from config AND delete from disk */
	const deleteProjectFromDisk = useCallback(
		async (cwd: string) => {
			const config = await window.vetta.config.get();
			config.projects = config.projects.filter((p) => p !== cwd);
			const archived = (config.archivedProjects ?? []).filter((p) => p !== cwd);
			await window.vetta.config.set({ projects: config.projects, archivedProjects: archived });
			await window.vetta.fs.delete(cwd);
			await refreshProjects();
		},
		[refreshProjects],
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
		createProject,
		openProject,
		removeProject,
		archiveProject,
		unarchiveProject,
		deleteArchivedProject,
		deleteProjectFromDisk,
		toggleProject,
		deleteSession,
		renameSession,
	};
}
