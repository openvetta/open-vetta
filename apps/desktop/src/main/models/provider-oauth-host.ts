import { getOrCreateSharedModelRuntime, getSharedModelAuth } from "../agent-runtime/host-services.js";
import { openExternalUrl } from "../open-external.js";
import { getDesktopModelSettingsService } from "./model-settings-host.js";
import { refreshPresetModels } from "./presets/sync.js";
import { DesktopProviderOAuthService } from "./provider-oauth-service.js";

let desktopProviderOAuthService: DesktopProviderOAuthService | undefined;

export function getDesktopProviderOAuthService(): DesktopProviderOAuthService {
	if (!desktopProviderOAuthService) {
		getOrCreateSharedModelRuntime();
		desktopProviderOAuthService = new DesktopProviderOAuthService({
			auth: getSharedModelAuth(),
			openUrl: openExternalUrl,
			refreshModels: refreshPresetModels,
			readConfig: () => getDesktopModelSettingsService().getConfig(),
			writeConfig: (config) => getDesktopModelSettingsService().replaceConfig(config),
			refreshRuntime: () => getOrCreateSharedModelRuntime().refresh(),
		});
	}
	return desktopProviderOAuthService;
}
