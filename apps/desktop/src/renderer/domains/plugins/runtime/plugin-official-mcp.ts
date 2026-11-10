import type { PluginOfficialApi } from "@vetta-org/plugin-sdk";

export function createOfficialMcpApi(
	assertOfficial: () => void,
	capabilitySessionId: string,
): PluginOfficialApi["mcp"] {
	const mcp = window.vetta.plugins.internalCapabilities.mcp;
	return {
		list: async (target) => {
			assertOfficial();
			return mcp.list(capabilitySessionId, target);
		},
		get: async (name, target) => {
			assertOfficial();
			return mcp.get(capabilitySessionId, name, target);
		},
		listNames: async (target) => {
			assertOfficial();
			return (await mcp.list(capabilitySessionId, target)).map((server) => server.name);
		},
		upsert: async (name, data, target) => {
			assertOfficial();
			return mcp.upsert(capabilitySessionId, name, data, target);
		},
		setEnabled: async (name, enabled, target) => {
			assertOfficial();
			await mcp.setEnabled(capabilitySessionId, name, enabled, target);
		},
		remove: async (name, target) => {
			assertOfficial();
			await mcp.remove(capabilitySessionId, name, target);
		},
	};
}
