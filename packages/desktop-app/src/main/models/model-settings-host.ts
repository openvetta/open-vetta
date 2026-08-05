import { getOrCreateSharedModelRuntime } from "../greenfield-runtime/desktop-coding-agent-host-services.js";
import { ModelSettingsService, readModelsConfig, writeModelsConfig } from "./model-settings-service.js";

let desktopModelSettingsService: ModelSettingsService | undefined;

export function getDesktopModelSettingsService(): ModelSettingsService {
	desktopModelSettingsService ??= new ModelSettingsService({
		readConfig: readModelsConfig,
		writeConfig: writeModelsConfig,
		refreshRegistry: async () => {
			await getOrCreateSharedModelRuntime().refresh();
		},
	});
	return desktopModelSettingsService;
}
