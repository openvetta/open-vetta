import type { SettingsTab } from "@shared/store/atoms";

export interface SettingsTabRegistration {
	key: SettingsTab;
	label: string;
	icon: string;
	personalOnly?: boolean;
	requireAuth?: boolean;
	macOnly?: boolean;
}

export interface SettingsSectionRegistration {
	id: string;
	tab: SettingsTab;
	title: string;
}

export const SETTINGS_TABS: readonly SettingsTabRegistration[] = [
	{ key: "account", label: "账户", icon: "icon-[mdi--account-outline]", requireAuth: true },
	{ key: "general", label: "通用设置", icon: "icon-[mdi--cog-outline]" },
	{ key: "appearance", label: "外观", icon: "icon-[mdi--palette-outline]" },
	{ key: "context", label: "Agent配置", icon: "icon-[mdi--robot-outline]" },
	{ key: "models", label: "模型配置", icon: "icon-[mdi--brain]" },
	{ key: "mcp", label: "MCP 服务器", icon: "icon-[mdi--server-outline]" },
	{ key: "im", label: "Claw", icon: "icon-[mdi--message-text-outline]" },
	{ key: "webhook", label: "消息推送", icon: "icon-[mdi--webhook]" },
	// { key: "team", label: "团队管理", icon: "icon-[mdi--account-group-outline]", personalOnly: true },
	{ key: "archive", label: "已归档", icon: "icon-[mdi--archive-outline]" },
	{ key: "shortcuts", label: "快捷键", icon: "icon-[mdi--keyboard-outline]" },
	{ key: "environment", label: "应用环境", icon: "icon-[mdi--package-variant-closed]" },
	{ key: "permissions", label: "权限管理", icon: "icon-[mdi--shield-lock-outline]", macOnly: true },
] as const;

export const SETTINGS_SECTIONS = [
	{ tab: "general", id: "general-workspace", title: "工作区" },
	{ tab: "general", id: "general-updates", title: "版本更新" },
	{ tab: "general", id: "general-sandbox", title: "沙盒" },
	{ tab: "general", id: "general-notifications", title: "通知" },
	{ tab: "general", id: "general-developer", title: "开发者" },
	{ tab: "appearance", id: "appearance-mode", title: "外观模式" },
	{ tab: "appearance", id: "appearance-theme", title: "主题" },
	{ tab: "account", id: "account-profile", title: "个人信息" },
	{ tab: "account", id: "account-transactions", title: "积分记录" },
	{ tab: "team", id: "team-management", title: "团队管理" },
	{ tab: "team", id: "team-my-teams", title: "我的团队" },
	{ tab: "team", id: "team-detail-info", title: "团队详情" },
	{ tab: "team", id: "team-members", title: "成员列表" },
	{ tab: "models", id: "models-thinking", title: "思考模式" },
	{ tab: "models", id: "models-preset-providers", title: "预设服务商" },
	{ tab: "models", id: "models-providers", title: "服务商" },
	{ tab: "models", id: "models-remote-providers", title: "远程服务商" },
	{ tab: "models", id: "models-json", title: "编辑 JSON" },
	{ tab: "mcp", id: "mcp-remote-list", title: "远程 MCP 列表" },
	{ tab: "mcp", id: "mcp-remote-available", title: "可添加的远程服务器" },
	{ tab: "mcp", id: "mcp-server-list", title: "服务器列表" },
	{ tab: "mcp", id: "mcp-json", title: "编辑 JSON" },
	{ tab: "environment", id: "environment-runtime", title: "运行时" },
	{ tab: "environment", id: "environment-mirrors", title: "镜像源" },
	{ tab: "permissions", id: "permissions-system", title: "系统权限" },
	{ tab: "im", id: "imbridge-toggle", title: "总开关" },
	{ tab: "im", id: "imbridge-model", title: "对话模型" },
	{ tab: "im", id: "imbridge-channels", title: "消息渠道" },
	{ tab: "im", id: "imbridge-status", title: "状态与日志" },
	{ tab: "im", id: "imbridge-logs", title: "实时日志" },
	{ tab: "webhook", id: "webhook-channels", title: "渠道列表" },
	{ tab: "shortcuts", id: "shortcuts-global", title: "全局快捷键" },
	{ tab: "archive", id: "archived-list", title: "归档列表" },
	{ tab: "context", id: "agent-personalization", title: "个性化" },
	{ tab: "context", id: "agent-images", title: "图片" },
	{ tab: "context", id: "agent-experimental", title: "扩展功能" },
] as const satisfies readonly SettingsSectionRegistration[];

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];
export type RegisteredSettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const SETTINGS_SECTION = Object.fromEntries(SETTINGS_SECTIONS.map((section) => [section.id, section])) as {
	[K in SettingsSectionId]: Extract<RegisteredSettingsSection, { id: K }>;
};

export function getSettingsSections(): readonly SettingsSectionRegistration[] {
	return SETTINGS_SECTIONS;
}

export function getSettingsSectionsByTab(tab: SettingsTab): SettingsSectionRegistration[] {
	return SETTINGS_SECTIONS.filter((section) => section.tab === tab);
}

export function findSettingsSection(id: string): SettingsSectionRegistration | undefined {
	return SETTINGS_SECTIONS.find((section) => section.id === id);
}
