import type { PluginOfficialApi, PluginOfficialInstalledSkill } from "@vetta-org/plugin-sdk";

export function createOfficialSkillsApi(assertOfficial: () => void): PluginOfficialApi["skills"] {
	return {
		list: async (cwd) => {
			assertOfficial();
			return window.vetta.skills.list(cwd);
		},
		getManifest: async () => {
			assertOfficial();
			return (await window.vetta.skills.getMarketManifest()) as Record<string, PluginOfficialInstalledSkill>;
		},
		setEnabled: async (name, enabled) => {
			assertOfficial();
			const manifest = await window.vetta.skills.getMarketManifest();
			const entry = manifest[name];
			if (!entry) throw new Error(`Installed skill/scene not found: ${name}`);
			if (Boolean(entry.enabled) !== enabled) await window.vetta.skills.toggle(name);
			return { name, enabled };
		},
		uninstall: async (name, type) => {
			assertOfficial();
			const manifest = await window.vetta.skills.getMarketManifest();
			const entry = manifest[name];
			if (!entry) throw new Error(`Installed skill/scene not found: ${name}`);
			const resolvedType = type ?? (entry.type === "scene" ? "scene" : "skill");
			await window.vetta.skills.uninstall(name, resolvedType);
		},
	};
}
