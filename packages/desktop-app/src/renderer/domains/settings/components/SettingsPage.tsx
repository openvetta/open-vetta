import { useThemeSurface } from "@vetta/theme-sdk/appearance";
import type { SettingsTab } from "@shared/store/atoms";
import { AccountSettings } from "./AccountSettings";
import { AgentSettings } from "./AgentSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { AppshotSettings } from "./AppshotSettings";
import { ArchivedProjectsSettings } from "./ArchivedProjectsSettings";
import { EnvironmentSettings } from "./EnvironmentSettings";
import { GeneralSettings } from "./GeneralSettings";
import { ImBridgeSettings } from "./ImBridgeSettings";
import { KnowledgeBaseSettings } from "./KnowledgeBaseSettings";
import { ModelsSettings } from "./ModelsSettings";
import { NewSessionSettings } from "./NewSessionSettings";
import { PermissionsSettings } from "./PermissionsSettings";
import { PetSettings } from "./PetSettings";
import { PluginsSettings } from "./PluginsSettings";
import { SettingsPageView } from "./SettingsPageView";
import { ShortcutsSettings } from "./ShortcutsSettings";
import { TeamSettings } from "./TeamSettings";
import { useSettingsPageModel } from "./useSettingsPageModel";
import { WebhookSettings } from "./WebhookSettings";
import "./settings-highlight.css";

/** MCP 已迁至扩展 → 连接器；`mcp` 保留在 SettingsTab 供 analytics / 旧链接重定向，此处不渲染。 */
const SETTINGS_CONTENT: { [K in Exclude<SettingsTab, "mcp">]: () => JSX.Element } = {
	general: GeneralSettings,
	appearance: AppearanceSettings,
	account: AccountSettings,
	models: ModelsSettings,
	environment: EnvironmentSettings,
	permissions: PermissionsSettings,
	im: ImBridgeSettings,
	webhook: WebhookSettings,
	shortcuts: ShortcutsSettings,
	appshot: AppshotSettings,
	archive: ArchivedProjectsSettings,
	team: TeamSettings,
	context: AgentSettings,
	plugins: PluginsSettings,
	knowledge: KnowledgeBaseSettings,
	pet: PetSettings,
	newSession: NewSessionSettings,
};

export function SettingsPage(): JSX.Element {
	const model = useSettingsPageModel();
	const contentSurface = useThemeSurface("settings.pageContent");
	const Content =
		model.activeTab === "mcp" ? SETTINGS_CONTENT.general : SETTINGS_CONTENT[model.activeTab];

	return (
		<SettingsPageView
			content={<Content />}
			contentSurfaceRootClassName={contentSurface?.rootClassName}
			model={model}
		/>
	);
}
