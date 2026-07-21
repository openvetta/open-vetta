import type { PluginOfficialApi, PluginOfficialExperimentalSettings } from "@vetta-org/plugin-sdk";

function normalizeExperimental(
	config: Awaited<ReturnType<typeof window.vetta.config.get>>,
): PluginOfficialExperimentalSettings {
	return {
		vettaCli: config.experimental?.vettaCli !== false,
		promptPrediction: config.experimental?.promptPrediction !== false,
		agentSkills: config.experimental?.agentSkills !== false,
	};
}

export function createOfficialAgentApi(assertOfficial: () => void): PluginOfficialApi["agent"] {
	return {
		getExperimental: async () => {
			assertOfficial();
			return normalizeExperimental(await window.vetta.config.get());
		},
		setExperimental: async (input) => {
			assertOfficial();
			await window.vetta.config.set({ experimental: input });
			return normalizeExperimental(await window.vetta.config.get());
		},
	};
}
