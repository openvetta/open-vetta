import { PluginWorkspaceViewSurface } from "@domains/plugins/components/PluginWorkspaceViewRoute";
import { useThemeSurface } from "@vetta-org/theme-sdk/appearance";
import type { SettingsTab } from "@shared/store/atoms";
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { SettingsPageView } from "./SettingsPageView";
import { SETTINGS_TAB_LOADERS, useIdleSettingsTabPrefetch } from "./settings-tab-loaders";
import { useSettingsPageModel } from "./useSettingsPageModel";
import "./settings-highlight.css";

/** MCP 已迁至扩展 → 连接器；`mcp` 保留在 SettingsTab 供 analytics / 旧链接重定向，此处不渲染。 */
const SETTINGS_CONTENT: Record<Exclude<SettingsTab, "mcp">, LazyExoticComponent<ComponentType>> = {
	usage: lazy(SETTINGS_TAB_LOADERS.usage),
	general: lazy(SETTINGS_TAB_LOADERS.general),
	launcher: lazy(SETTINGS_TAB_LOADERS.launcher),
	appearance: lazy(SETTINGS_TAB_LOADERS.appearance),
	models: lazy(SETTINGS_TAB_LOADERS.models),
	environment: lazy(SETTINGS_TAB_LOADERS.environment),
	extensions: lazy(SETTINGS_TAB_LOADERS.extensions),
	permissions: lazy(SETTINGS_TAB_LOADERS.permissions),
	im: lazy(SETTINGS_TAB_LOADERS.im),
	webhook: lazy(SETTINGS_TAB_LOADERS.webhook),
	spaces: lazy(SETTINGS_TAB_LOADERS.spaces),
	shortcuts: lazy(SETTINGS_TAB_LOADERS.shortcuts),
	appshot: lazy(SETTINGS_TAB_LOADERS.appshot),
	archive: lazy(SETTINGS_TAB_LOADERS.archive),
	context: lazy(SETTINGS_TAB_LOADERS.context),
	knowledge: lazy(SETTINGS_TAB_LOADERS.knowledge),
	pet: lazy(SETTINGS_TAB_LOADERS.pet),
	remote: lazy(SETTINGS_TAB_LOADERS.remote),
	sshHosts: lazy(SETTINGS_TAB_LOADERS.sshHosts),
};

export function SettingsPage(): JSX.Element {
	const model = useSettingsPageModel();
	const contentSurface = useThemeSurface("settings.pageContent");
	const Content =
		model.activeTab === "mcp" ? SETTINGS_CONTENT.general : SETTINGS_CONTENT[model.activeTab];

	const activeTab = model.activeTab === "mcp" ? "general" : model.activeTab;
	useIdleSettingsTabPrefetch(activeTab);
	const embedded = model.embeddedView;

	// 内嵌的插件视图是整页 surface：给它完整宽高，不套设置页的居中窄栏。
	// 找不到该视图时退回「更多选项」列表，而不是把用户踢出设置。
	const content = embedded ? (
		<PluginWorkspaceViewSurface
			key={`${embedded.pluginId}:${embedded.viewId}`}
			pluginId={embedded.pluginId}
			viewId={embedded.viewId}
			onMissing={model.onCloseEmbeddedView}
		/>
	) : (
		<Suspense fallback={null}>
			{/* key=tab：切换侧栏时重挂载，避免不同 tab 复用同一组件实例的残留状态 */}
			<div key={activeTab} className="w-full min-h-0">
				<Content />
			</div>
		</Suspense>
	);

	return (
		<SettingsPageView
			content={content}
			contentSurfaceRootClassName={contentSurface?.rootClassName}
			fillContent={Boolean(embedded)}
			model={model}
		/>
	);
}
