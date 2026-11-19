import { assignSpace, spacesAtom } from "@shared/store/spaces";
import type { PluginOfficialApi } from "@vetta-org/plugin-sdk";
import { getDefaultStore } from "jotai";

export function createOfficialProjectsApi(
	assertOfficial: () => void,
	capabilitySessionId: string,
): PluginOfficialApi["projects"] {
	const projects = window.vetta.plugins.internalCapabilities.projects;
	const sessions = window.vetta.plugins.internalCapabilities.sessions;
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
			return sessions.list(capabilitySessionId, cwd);
		},
		listRuntimeProjects: async () => {
			assertOfficial();
			return sessions.listRuntimeProjects(capabilitySessionId);
		},
		create: async (name, path) => {
			assertOfficial();
			// 空间归属只存在于界面侧。主进程 create 不写它，未登记的项目会被当成主工作区。
			// 只给这次真正新建的项目补当前空间；已经在列表里的保持原归属，避免幂等重试把项目搬走。
			const before = await projects.list(capabilitySessionId).catch(() => null);
			const entry = await projects.create(capabilitySessionId, name, path);
			const alreadyRegistered =
				before !== null &&
				[...before.projects, ...before.archivedProjects].some((item) => item.path === entry.path);
			if (!alreadyRegistered) {
				const store = getDefaultStore();
				const spaceId = store.get(spacesAtom).selected;
				store.set(spacesAtom, (state) => assignSpace(state, { kind: "project", key: entry.path }, spaceId));
			}
			return entry;
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
