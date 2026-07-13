import type { McpServerConfigData, McpStdioServerConfigData } from "@preload/api.js";

/** settings 命名空间下、内置 MCP 可用的 i18n key（须与 locales 同步扩展） */
export type BuiltinMcpLabelKey =
	| "mcpPresets.canva.displayName"
	| "mcpPresets.canva.description"
	| "mcpPresets.notion.displayName"
	| "mcpPresets.notion.description"
	| "mcpPresets.figma.displayName"
	| "mcpPresets.figma.description"
	| "mcpPresets.slack.displayName"
	| "mcpPresets.slack.description"
	| "mcpPresets.gmail.displayName"
	| "mcpPresets.gmail.description"
	| "mcpPresets.googleCalendar.displayName"
	| "mcpPresets.googleCalendar.description"
	| "mcpPresets.googleDrive.displayName"
	| "mcpPresets.googleDrive.description";

export type BuiltinMcpSecretLabelKey =
	| "mcpPresets.secrets.notionToken"
	| "mcpPresets.secrets.figmaApiKey"
	| "mcpPresets.secrets.slackBotToken"
	| "mcpPresets.secrets.slackTeamId"
	| "mcpPresets.secrets.googleClientId"
	| "mcpPresets.secrets.googleClientSecret"
	| "mcpPresets.secrets.gdriveCredentialsPath";

export type BuiltinMcpGuideKey =
	| "mcpPresets.guides.notion"
	| "mcpPresets.guides.figma"
	| "mcpPresets.guides.slack"
	| "mcpPresets.guides.gmail"
	| "mcpPresets.guides.googleCalendar"
	| "mcpPresets.guides.googleDrive"
	| "mcpPresets.guides.canva";

/** 添加/配置时需要用户填写的密钥或标识 */
export interface BuiltinMcpSecretField {
	/** 写入 mcpServers[].env 的键名 */
	envKey: string;
	labelKey: BuiltinMcpSecretLabelKey;
	/** 是否必填 */
	required?: boolean;
	/** 输入框用 password */
	secret?: boolean;
	placeholder?: string;
	/** 官方获取密钥/凭证的页面，一键在浏览器打开 */
	helpUrl?: string;
}

/** 内置 MCP 预设：仅提供配置模板与 UI 元数据，不自动写入 mcp.json，也不预装依赖。 */
export interface BuiltinMcpPreset {
	/** 稳定 id，用于图标文件名与 i18n key */
	id: string;
	/** 写入 mcp.json 的默认 key */
	name: string;
	/** public/mcp 下的图标文件名 */
	iconFile: string;
	displayNameKey: BuiltinMcpLabelKey;
	descriptionKey: BuiltinMcpLabelKey;
	config: McpStdioServerConfigData | Extract<McpServerConfigData, { type: "http" }>;
	/** 需要用户提供的密钥；有则添加前弹出表单 */
	secrets?: readonly BuiltinMcpSecretField[];
	/** 弹窗内展示的「怎么获取」简短步骤（i18n，可用换行） */
	setupGuideKey?: BuiltinMcpGuideKey;
	/** 总览型帮助链接（弹窗顶部「打开说明」） */
	setupHelpUrl?: string;
	/** args 中用于回退识别的包名片段 */
	packageHint?: string;
}

const MCP_ICON_BASE = "./mcp";

export const BUILTIN_MCP_PRESETS: readonly BuiltinMcpPreset[] = [
	{
		id: "canva",
		name: "canva",
		iconFile: "canva.webp",
		displayNameKey: "mcpPresets.canva.displayName",
		descriptionKey: "mcpPresets.canva.description",
		// 官方设计侧远程 MCP；经 mcp-remote 接入，首次连接浏览器 OAuth（无需粘贴 Key）
		packageHint: "mcp.canva.com",
		setupGuideKey: "mcpPresets.guides.canva",
		setupHelpUrl: "https://www.canva.com/help/mcp-agent-setup/",
		config: {
			command: "npx",
			args: ["-y", "mcp-remote", "https://mcp.canva.com/mcp"],
		},
	},
	{
		id: "notion",
		name: "notion",
		iconFile: "notion.webp",
		displayNameKey: "mcpPresets.notion.displayName",
		descriptionKey: "mcpPresets.notion.description",
		packageHint: "@notionhq/notion-mcp-server",
		setupGuideKey: "mcpPresets.guides.notion",
		setupHelpUrl: "https://www.notion.so/my-integrations",
		config: {
			command: "npx",
			args: ["-y", "@notionhq/notion-mcp-server"],
		},
		secrets: [
			{
				envKey: "NOTION_TOKEN",
				labelKey: "mcpPresets.secrets.notionToken",
				required: true,
				secret: true,
				placeholder: "ntn_…",
				helpUrl: "https://www.notion.so/my-integrations",
			},
		],
	},
	{
		id: "figma",
		name: "figma",
		iconFile: "figma.webp",
		displayNameKey: "mcpPresets.figma.displayName",
		descriptionKey: "mcpPresets.figma.description",
		packageHint: "figma-developer-mcp",
		setupGuideKey: "mcpPresets.guides.figma",
		setupHelpUrl: "https://www.figma.com/developers/api#access-tokens",
		config: {
			command: "npx",
			args: ["-y", "figma-developer-mcp", "--stdio"],
		},
		secrets: [
			{
				envKey: "FIGMA_API_KEY",
				labelKey: "mcpPresets.secrets.figmaApiKey",
				required: true,
				secret: true,
				helpUrl: "https://www.figma.com/developers/api#access-tokens",
			},
		],
	},
	{
		id: "slack",
		name: "slack",
		iconFile: "slack.webp",
		displayNameKey: "mcpPresets.slack.displayName",
		descriptionKey: "mcpPresets.slack.description",
		packageHint: "@modelcontextprotocol/server-slack",
		setupGuideKey: "mcpPresets.guides.slack",
		setupHelpUrl: "https://api.slack.com/apps",
		config: {
			command: "npx",
			args: ["-y", "@modelcontextprotocol/server-slack"],
		},
		secrets: [
			{
				envKey: "SLACK_BOT_TOKEN",
				labelKey: "mcpPresets.secrets.slackBotToken",
				required: true,
				secret: true,
				placeholder: "xoxb-…",
				helpUrl: "https://api.slack.com/apps",
			},
			{
				envKey: "SLACK_TEAM_ID",
				labelKey: "mcpPresets.secrets.slackTeamId",
				required: true,
				secret: false,
				placeholder: "T0…",
				helpUrl: "https://api.slack.com/methods/auth.test",
			},
		],
	},
	{
		id: "gmail",
		name: "gmail",
		iconFile: "gmail.webp",
		displayNameKey: "mcpPresets.gmail.displayName",
		descriptionKey: "mcpPresets.gmail.description",
		packageHint: "@gongrzhe/server-gmail-autoauth-mcp",
		setupGuideKey: "mcpPresets.guides.gmail",
		setupHelpUrl: "https://console.cloud.google.com/apis/credentials",
		config: {
			command: "npx",
			args: ["-y", "@gongrzhe/server-gmail-autoauth-mcp"],
		},
		// 默认靠浏览器 OAuth，不弹密钥表单；高级凭证可在添加后用钥匙图标填写
	},
	{
		id: "google-calendar",
		name: "google-calendar",
		iconFile: "google-calendar.webp",
		displayNameKey: "mcpPresets.googleCalendar.displayName",
		descriptionKey: "mcpPresets.googleCalendar.description",
		packageHint: "@cocal/google-calendar-mcp",
		setupGuideKey: "mcpPresets.guides.googleCalendar",
		setupHelpUrl: "https://console.cloud.google.com/apis/credentials",
		config: {
			command: "npx",
			args: ["-y", "@cocal/google-calendar-mcp"],
		},
		secrets: [
			{
				envKey: "GOOGLE_CLIENT_ID",
				labelKey: "mcpPresets.secrets.googleClientId",
				required: true,
				secret: false,
				helpUrl: "https://console.cloud.google.com/apis/credentials",
			},
			{
				envKey: "GOOGLE_CLIENT_SECRET",
				labelKey: "mcpPresets.secrets.googleClientSecret",
				required: true,
				secret: true,
				helpUrl: "https://console.cloud.google.com/apis/credentials",
			},
		],
	},
	{
		id: "google-drive",
		name: "google-drive",
		iconFile: "google-drive.webp",
		displayNameKey: "mcpPresets.googleDrive.displayName",
		descriptionKey: "mcpPresets.googleDrive.description",
		packageHint: "@modelcontextprotocol/server-gdrive",
		setupGuideKey: "mcpPresets.guides.googleDrive",
		setupHelpUrl: "https://console.cloud.google.com/apis/credentials",
		config: {
			command: "npx",
			args: ["-y", "@modelcontextprotocol/server-gdrive"],
		},
		// 首次连接多走 OAuth；凭证路径为可选高级项，添加后用钥匙配置
	},
];

export function builtinMcpIconUrl(iconFile: string): string {
	return `${MCP_ICON_BASE}/${iconFile}`;
}

export function getBuiltinMcpPresetByName(name: string): BuiltinMcpPreset | undefined {
	return BUILTIN_MCP_PRESETS.find((preset) => preset.name === name);
}

export function getBuiltinMcpPresetById(id: string): BuiltinMcpPreset | undefined {
	return BUILTIN_MCP_PRESETS.find((preset) => preset.id === id);
}

/** 是否为内置预设对应的已添加条目（按 name 命中，或按包名特征回退匹配）。 */
export function isBuiltinMcpServer(name: string, config: McpServerConfigData): boolean {
	if (getBuiltinMcpPresetByName(name)) return true;
	return matchBuiltinMcpPreset(name, config) !== undefined;
}

export function matchBuiltinMcpPreset(name: string, config: McpServerConfigData): BuiltinMcpPreset | undefined {
	const byName = getBuiltinMcpPresetByName(name);
	if (byName) return byName;

	if (config.type === "http") return undefined;
	const args = config.args?.join(" ") ?? "";
	return BUILTIN_MCP_PRESETS.find((preset) => preset.packageHint && args.includes(preset.packageHint));
}

/** 有配置图标时返回 URL；否则 null（UI 使用默认 SVG）。 */
export function resolveMcpIcon(name: string, config: McpServerConfigData): string | null {
	const preset = matchBuiltinMcpPreset(name, config);
	if (preset) return builtinMcpIconUrl(preset.iconFile);
	return null;
}

export function buildBuiltinMcpServerConfig(
	preset: BuiltinMcpPreset,
	labels: { displayName: string; description: string },
	secretValues?: Record<string, string>,
): McpServerConfigData {
	const env: Record<string, string> = { ...(preset.config.type === "http" ? {} : preset.config.env) };
	if (secretValues) {
		for (const [key, value] of Object.entries(secretValues)) {
			const trimmed = value.trim();
			if (trimmed) env[key] = trimmed;
		}
	}
	const base = { ...preset.config, displayName: labels.displayName, description: labels.description };
	if (Object.keys(env).length === 0) return base;
	if (base.type === "http") {
		return { ...base, headers: { ...base.headers, ...env } };
	}
	return { ...base, env: { ...base.env, ...env } };
}

/** 已配置条目是否缺少必填密钥 */
export function missingRequiredSecrets(preset: BuiltinMcpPreset, config: McpServerConfigData): BuiltinMcpSecretField[] {
	const secrets = preset.secrets?.filter((field) => field.required) ?? [];
	if (secrets.length === 0) return [];
	const env = config.type === "http" ? config.headers : config.env;
	return secrets.filter((field) => !env?.[field.envKey]?.trim());
}

export function existingSecretValues(preset: BuiltinMcpPreset, config: McpServerConfigData): Record<string, string> {
	const env = config.type === "http" ? config.headers : config.env;
	const values: Record<string, string> = {};
	for (const field of preset.secrets ?? []) {
		const current = env?.[field.envKey];
		if (current) values[field.envKey] = current;
	}
	return values;
}

/** 添加前必须粘贴密钥 */
export function presetRequiresSecrets(preset: BuiltinMcpPreset): boolean {
	return preset.secrets?.some((field) => field.required) ?? false;
}

/**
 * 添加后首次使用走浏览器登录，无需先填 Key。
 * （有 setup 说明、且没有必填密钥）
 */
export function presetUsesBrowserAuth(preset: BuiltinMcpPreset): boolean {
	return Boolean(preset.setupGuideKey) && !presetRequiresSecrets(preset);
}
