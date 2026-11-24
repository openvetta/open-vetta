import type { SettingsTab } from "@shared/store/atoms";
import { type ComponentType, useEffect } from "react";

type SettingsTabLoader = () => Promise<{ default: ComponentType }>;

/** The same imports serve both React.lazy and intent prefetch. */
export const SETTINGS_TAB_LOADERS = {
	usage: async () => ({ default: (await import("./usage/UsageSettings")).UsageSettings }),
	context: async () => ({ default: (await import("./AgentSettings")).AgentSettings }),
	appearance: async () => ({ default: (await import("./AppearanceSettings")).AppearanceSettings }),
	appshot: async () => ({ default: (await import("./AppshotSettings")).AppshotSettings }),
	archive: async () => ({ default: (await import("./ArchivedProjectsSettings")).ArchivedProjectsSettings }),
	extensions: async () => ({ default: (await import("./ExtensionsSettings")).ExtensionsSettings }),
	environment: async () => ({ default: (await import("./EnvironmentSettings")).EnvironmentSettings }),
	launcher: async () => ({ default: (await import("./LauncherSettings")).LauncherSettings }),
	general: async () => ({ default: (await import("./GeneralSettings")).GeneralSettings }),
	im: async () => ({ default: (await import("./ImBridgeSettings")).ImBridgeSettings }),
	knowledge: async () => ({ default: (await import("./KnowledgeBaseSettings")).KnowledgeBaseSettings }),
	models: async () => ({ default: (await import("./ModelsSettings")).ModelsSettings }),
	permissions: async () => ({ default: (await import("./PermissionsSettings")).PermissionsSettings }),
	remote: async () => ({ default: (await import("./RemotePairingSettings")).RemotePairingSettings }),
	pet: async () => ({ default: (await import("./PetSettings")).PetSettings }),
	sshHosts: async () => ({ default: (await import("./SshHostsSettings")).SshHostsSettings }),
	spaces: async () => ({ default: (await import("./SpacesSettings")).SpacesSettings }),
	shortcuts: async () => ({ default: (await import("./ShortcutsSettings")).ShortcutsSettings }),
	webhook: async () => ({ default: (await import("./WebhookSettings")).WebhookSettings }),
} satisfies Record<Exclude<SettingsTab, "mcp">, SettingsTabLoader>;

export function prefetchSettingsTab(tab: string): void {
	const load = (SETTINGS_TAB_LOADERS as Record<string, SettingsTabLoader>)[tab];
	if (!load) return;
	void load().catch(() => {
		// React.lazy still handles navigation errors; prefetch remains optional.
	});
}

/**
 * 进入设置页后空闲期预取的标签。
 *
 * 悬停预取只比点击早几百毫秒，冷启动后首次点开这些标签仍要现付「下载 + 解析 + 求值」，
 * 内容区在 Suspense 下空白一拍，体感是点了没反应。外观页最明显，常用的通用、模型页一并带上。
 */
export const SETTINGS_IDLE_PREFETCH_TABS = ["appearance", "general", "models"] as const;

/** 设置页首帧之后的空闲时间里依次预取常用标签；当前标签已在加载，跳过。卸载前未触发则取消。 */
export function useIdleSettingsTabPrefetch(activeTab: string): void {
	// 只在进入设置页时安排一次：切换标签不该重新排队。
	// biome-ignore lint/correctness/useExhaustiveDependencies: 以挂载时的标签为准
	useEffect(() => {
		const run = (): void => {
			for (const tab of SETTINGS_IDLE_PREFETCH_TABS) {
				if (tab !== activeTab) prefetchSettingsTab(tab);
			}
		};
		if (typeof window.requestIdleCallback === "function") {
			const id = window.requestIdleCallback(run, { timeout: 1500 });
			return () => window.cancelIdleCallback(id);
		}
		const id = window.setTimeout(run, 500);
		return () => window.clearTimeout(id);
	}, []);
}
