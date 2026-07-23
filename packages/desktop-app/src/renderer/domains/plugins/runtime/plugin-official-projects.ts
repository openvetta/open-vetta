import type { PluginOfficialApi } from "@vetta-org/plugin-sdk";

export function createOfficialProjectsApi(
	assertOfficial: () => void,
	capabilitySessionId: string,
): PluginOfficialApi["projects"] {
	const projects = window.vetta.plugins.internalCapabilities.projects;
	return {
		list: async () => {
			assertOfficial();
			const snapshot = await projects.list(capabilitySessionId);
			return {
				workspacePath: snapshot.workspacePath,
				projects: snapshot.projects.map((entry) => ({ ...entry })),
				archivedProjects: snapshot.archivedProjects.map((entry) => ({ ...entry })),
			};
		},
		listSessions: async (cwd) => {
			assertOfficial();
			return window.vetta.session.listSessions(cwd);
		},
		listRuntimeProjects: async () => {
			assertOfficial();
			return window.vetta.session.listProjects();
		},
		create: async (name, path) => {
			assertOfficial();
			return projects.create(capabilitySessionId, name, path);
		},
		open: async (path, name) => {
			assertOfficial();
			return projects.open(capabilitySessionId, path, name);
		},
		rename: async (path, name) => {
			assertOfficial();
			return projects.rename(capabilitySessionId, path, name);
		},
		archive: async (path) => {
			assertOfficial();
			await projects.archive(capabilitySessionId, path);
		},
		unarchive: async (path) => {
			assertOfficial();
			await projects.unarchive(capabilitySessionId, path);
		},
		remove: async (path) => {
			assertOfficial();
			await projects.remove(capabilitySessionId, path);
		},
	};
}
