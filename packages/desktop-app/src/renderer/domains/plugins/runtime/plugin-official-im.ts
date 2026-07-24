import type { PluginOfficialApi } from "@vetta-org/plugin-sdk";
import { assertOfficialModelKeyExists } from "./plugin-official-models";

export function createOfficialImApi(assertOfficial: () => void, capabilitySessionId: string): PluginOfficialApi["im"] {
	const im = window.vetta.plugins.internalCapabilities.im;
	return {
		getStatus: async () => {
			assertOfficial();
			return im.getStatus(capabilitySessionId);
		},
		getLogs: async (limit = 50) => {
			assertOfficial();
			return im.listLogs(capabilitySessionId, limit);
		},
		setEnabled: async (enabled) => {
			assertOfficial();
			return { status: await im.setEnabled(capabilitySessionId, enabled) };
		},
		restart: async () => {
			assertOfficial();
			return { status: await im.restart(capabilitySessionId) };
		},
		setAgentModel: async (modelKey, reasoningLevel) => {
			assertOfficial();
			return { status: await im.setAgentModel(capabilitySessionId, modelKey, reasoningLevel) };
		},
		assertModelKeyExists: async (modelKey) => {
			assertOfficial();
			await assertOfficialModelKeyExists(modelKey, "set-agent-model");
		},
	};
}
