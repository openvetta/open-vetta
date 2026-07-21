import type { PluginOfficialApi, PluginOfficialProjectEntry } from "@vetta-org/plugin-sdk";

function isAbsolutePath(path: string): boolean {
	return path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

function joinPath(base: string, name: string): string {
	const sep = base.includes("\\") ? "\\" : "/";
	return `${base.replace(/[\\/]+$/, "")}${sep}${name}`;
}

function pathBasename(path: string): string {
	const normalized = path.replace(/[\\/]+$/, "");
	const parts = normalized.split(/[\\/]/);
	return parts[parts.length - 1] || path;
}

function samePath(a: string, b: string): boolean {
	const normalize = (value: string) => value.replace(/[\\/]+$/, "").toLowerCase();
	return normalize(a) === normalize(b);
}

function findProject(entries: PluginOfficialProjectEntry[], path: string): PluginOfficialProjectEntry | undefined {
	return entries.find((entry) => samePath(entry.path, path));
}

export function createOfficialProjectsApi(assertOfficial: () => void): PluginOfficialApi["projects"] {
	return {
		list: async () => {
			assertOfficial();
			const config = await window.vetta.config.get();
			return {
				workspacePath: config.workspacePath,
				projects: config.projects,
				archivedProjects: config.archivedProjects,
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
			const trimmed = name.trim();
			if (trimmed === "." || trimmed === ".." || trimmed.includes("/") || trimmed.includes("\\")) {
				throw new Error("Invalid project name.");
			}
			const config = await window.vetta.config.get();
			const projectPath = path?.trim() ? path.trim() : joinPath(config.workspacePath, trimmed);
			if (!isAbsolutePath(projectPath)) throw new Error("Project path must be absolute.");
			await window.vetta.fs.createDirectory(projectPath);
			const projects = [...config.projects];
			const archived = [...(config.archivedProjects ?? [])];
			if (!findProject(projects, projectPath) && !findProject(archived, projectPath)) {
				projects.push({ path: projectPath, name: trimmed });
				await window.vetta.config.set({ projects });
			}
			return { path: projectPath, name: trimmed };
		},
		open: async (path, name) => {
			assertOfficial();
			if (!isAbsolutePath(path)) throw new Error("Project path must be absolute.");
			const config = await window.vetta.config.get();
			const projects = [...config.projects];
			const archived = (config.archivedProjects ?? []).filter((entry) => !samePath(entry.path, path));
			const entry = { path, name: name?.trim() || pathBasename(path) };
			if (!findProject(projects, path)) projects.push(entry);
			await window.vetta.config.set({ projects, archivedProjects: archived });
			return entry;
		},
		rename: async (path, name) => {
			assertOfficial();
			const config = await window.vetta.config.get();
			const projects = [...config.projects];
			const archived = [...(config.archivedProjects ?? [])];
			const entry = findProject(projects, path) ?? findProject(archived, path);
			if (!entry) throw new Error(`Project not found: ${path}`);
			entry.name = name;
			await window.vetta.config.set({ projects, archivedProjects: archived });
			return entry;
		},
		archive: async (path) => {
			assertOfficial();
			const config = await window.vetta.config.get();
			const entry = findProject(config.projects, path);
			if (!entry) throw new Error(`Active project not found: ${path}`);
			const projects = config.projects.filter((item) => !samePath(item.path, path));
			const archived = [...(config.archivedProjects ?? [])];
			if (!findProject(archived, path)) archived.push(entry);
			await window.vetta.config.set({ projects, archivedProjects: archived });
		},
		unarchive: async (path) => {
			assertOfficial();
			const config = await window.vetta.config.get();
			const entry = findProject(config.archivedProjects ?? [], path);
			if (!entry) throw new Error(`Archived project not found: ${path}`);
			const archived = (config.archivedProjects ?? []).filter((item) => !samePath(item.path, path));
			const projects = [...config.projects];
			if (!findProject(projects, path)) projects.push(entry);
			await window.vetta.config.set({ projects, archivedProjects: archived });
		},
		remove: async (path) => {
			assertOfficial();
			const config = await window.vetta.config.get();
			const projects = config.projects.filter((item) => !samePath(item.path, path));
			const archived = (config.archivedProjects ?? []).filter((item) => !samePath(item.path, path));
			if (projects.length === config.projects.length && archived.length === (config.archivedProjects ?? []).length) {
				throw new Error(`Project not found: ${path}`);
			}
			await window.vetta.config.set({ projects, archivedProjects: archived });
		},
	};
}
