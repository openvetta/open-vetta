import { getOrCreateSharedModelRegistry } from "../runtime.js";
import { ModelSettingsService, readModelsConfig, writeModelsConfig } from "./model-settings-service.js";

let desktopModelSettingsService: ModelSettingsService | undefined;

export function getDesktopModelSettingsService(): ModelSettingsService {
	desktopModelSettingsService ??= new ModelSettingsService({
		readConfig: readModelsConfig,
		writeConfig: writeModelsConfig,
		refreshRegistry: async () => {
			await getOrCreateSharedModelRegistry().refresh();
		},
	});
	return desktopModelSettingsService;
}
