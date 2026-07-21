import type { PluginOfficialApi } from "@vetta-org/plugin-sdk";

export function createOfficialDownloadsApi(assertOfficial: () => void): PluginOfficialApi["downloads"] {
	return {
		list: async () => {
			assertOfficial();
			return window.vetta.downloads.list();
		},
		cancel: async (id) => {
			assertOfficial();
			await window.vetta.downloads.cancel(id);
		},
	};
}
