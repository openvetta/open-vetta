import { getOrCreateSharedModelRuntime, syncSharedModelRuntimeCredentials } from "../agent-runtime/host-services.js";
import { agentTeamExternalConditionChanges } from "../agent-teams/team-external-condition-channel.js";
import { getAppLogger } from "../logger.js";
import { invalidateProxyProviderRouting } from "../proxy/proxy-host.js";
import { getDesktopModelCredentialStore } from "./model-credential-store.js";
import {
	MODELS_CONFIG_PATH,
	ModelSettingsService,
	readModelsConfig,
	readModelsConfigFileSync,
	readModelsConfigSync,
	writeModelsConfig,
} from "./model-settings-service.js";
import { ModelsConfigWatcher } from "./models-config-watcher.js";

let desktopModelSettingsService: ModelSettingsService | undefined;
let modelsConfigWatcher: ModelsConfigWatcher | undefined;
const modelSettingsLog = getAppLogger("model-settings");
const modelSettingsChangedListeners = new Set<(providerIds: readonly string[]) => void>();

export function onDesktopModelSettingsChanged(listener: (providerIds: readonly string[]) => void): () => void {
	modelSettingsChangedListeners.add(listener);
	return () => modelSettingsChangedListeners.delete(listener);
}

export function getDesktopModelSettingsService(): ModelSettingsService {
	const credentials = getDesktopModelCredentialStore();
	if (!desktopModelSettingsService) {
		desktopModelSettingsService = new ModelSettingsService({
			readConfig: readModelsConfig,
			writeConfig: async (config) => {
				await writeModelsConfig(config);
				modelsConfigWatcher?.noteWritten(config);
			},
			credentials,
			refreshRegistry: async () => {
				syncSharedModelRuntimeCredentials(credentials, readModelsConfigSync().providers);
				getOrCreateSharedModelRuntime().refresh();
			},
			onProviderAccessChanged: (providerIds) => {
				for (const provider of providerIds) {
					agentTeamExternalConditionChanges.publish({ category: "authentication", provider });
				}
			},
			onConfigChanged: (providerIds) => {
				// 供应商的代理开关就存在 models.json 里，改完要让代理解析器重读。
				invalidateProxyProviderRouting();
				for (const listener of modelSettingsChangedListeners) listener(providerIds);
			},
		});
		void desktopModelSettingsService.getConfig().catch((error) => {
			modelSettingsLog.warn("迁移模型凭据失败:", error);
		});
	}
	return desktopModelSettingsService;
}

/**
 * 监听 models.json 被应用外的程序改动（如 Magpie 在 Agents 页接入或断开 Vetta），
 * 让运行时与设置页、模型选择器不重启就跟上。返回停止监听的函数。
 */
export function startModelsConfigWatcher(): () => void {
	const service = getDesktopModelSettingsService();
	modelsConfigWatcher ??= new ModelsConfigWatcher(MODELS_CONFIG_PATH, readModelsConfigFileSync, (providerIds) => {
		modelSettingsLog.info(`models.json 被外部改动，刷新服务商：${providerIds.join(", ")}`);
		void service.reloadAfterExternalChange(providerIds).catch((error) => {
			modelSettingsLog.warn("外部改动后刷新模型配置失败:", error);
		});
	});
	modelsConfigWatcher.start();
	return () => modelsConfigWatcher?.stop();
}
