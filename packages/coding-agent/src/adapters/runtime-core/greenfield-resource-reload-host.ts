import { resetApiProviders } from "@vetta/ai";
import type { SettingsManager } from "../../core/settings-manager.js";
import type { SessionResourceRuntime } from "../../resources/index.js";

export interface CodingAgentGreenfieldResourceReloadHostOptions {
	readonly settingsManager: Pick<SettingsManager, "reload">;
	readonly resourceLoader: Pick<SessionResourceRuntime, "reload">;
	readonly runWithExtensionLifecycle: (operation: () => Promise<void>) => Promise<void>;
	readonly afterReload?: () => Promise<void> | void;
	readonly resetProviders?: () => void;
}

/** 按 Legacy 顺序重载设置、Provider 注册表和本地资源。 */
export class CodingAgentGreenfieldResourceReloadHost {
	private readonly resetProviders: () => void;

	constructor(private readonly options: CodingAgentGreenfieldResourceReloadHostOptions) {
		this.resetProviders = options.resetProviders ?? resetApiProviders;
	}

	reload(): Promise<void> {
		return this.options.runWithExtensionLifecycle(async () => {
			this.options.settingsManager.reload();
			this.resetProviders();
			await this.options.resourceLoader.reload();
			await this.options.afterReload?.();
		});
	}
}
