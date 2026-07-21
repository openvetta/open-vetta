import type { PluginOfficialApi } from "@vetta-org/plugin-sdk";

export function createOfficialUpdaterApi(assertOfficial: () => void): PluginOfficialApi["updater"] {
	return {
		getState: async () => {
			assertOfficial();
			return window.vetta.updater.getState();
		},
		getCurrentVersion: async () => {
			assertOfficial();
			return window.vetta.updater.getCurrentVersion();
		},
		check: async () => {
			assertOfficial();
			return window.vetta.updater.check();
		},
		download: async () => {
			assertOfficial();
			return window.vetta.updater.download();
		},
		install: async () => {
			assertOfficial();
			await window.vetta.updater.install();
		},
		dismiss: async () => {
			assertOfficial();
			await window.vetta.updater.dismiss();
		},
		cancel: async () => {
			assertOfficial();
			await window.vetta.updater.cancel();
		},
	};
}
