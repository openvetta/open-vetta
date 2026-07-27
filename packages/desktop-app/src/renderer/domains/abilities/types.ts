/**
 * 能力（Ability）统一模型（ADR-0049）。
 * 五种 type 共用一套卡片与详情呈现；物理安装仍分三轨，差异收敛在 actions 层。
 */
import type { InstalledPlugin, PluginPermission } from "@preload/api";
import type { AbilityMember, AbilityType, MarketAbility } from "@shared/lib/api";
import type { McpSettingsModel } from "../settings/components/useMcpSettingsModel";
import type { BuiltinMcpPreset } from "../settings/mcp/builtin-mcp-presets";

export type AbilityScope = "discover" | "mine";

/** 类型筛选轴取值；`all` 为不过滤。 */
export type AbilityTypeFilter = AbilityType | "all";

export const ABILITY_TYPES: readonly AbilityType[] = ["skill", "scene", "mcp", "plugin", "bundle"];

/** 分类筛选轴：`all` 为不过滤，`uncategorized` 为未分类。 */
export const ABILITY_CATEGORY_ALL = "__all__";
export const ABILITY_CATEGORY_UNCATEGORIZED = "__uncategorized__";

export interface AbilityBase {
	/** `<type>:<slug>`，与服务端引用形式一致。 */
	id: string;
	slug: string;
	title: string;
	description: string;
	/** 已解析的图标值：空 / `solar:xxx` / 绝对 URL / `vetta-plugin://…`。 */
	icon?: string;
	/** 分类名；未分类为空串。 */
	category: string;
	tags: string[];
	author: string;
	license: string;
	/** 市场版本；无市场行时退回本地版本。 */
	version: string;
	/** 台账（或本地清单）记录的已安装版本。 */
	localVersion?: string;
	/** 产物摘要，安装前校验；mcp / bundle 恒为空。 */
	sha256?: string;
	installed: boolean;
	enabled: boolean;
	/** 内置 / 通用 Agent 等只读能力：不可安装、卸载、启停。 */
	readonly: boolean;
	needsUpdate: boolean;
	/** 缺凭证或未授权，装了也用不了。 */
	setupRequired: boolean;
	busy: boolean;
	downloadCount: number;
	/** 用户自行导入（本地 zip / 从路径安装）。 */
	isCustom: boolean;
	/** 随 App 分发的内置能力（skill-presets、系统插件）。 */
	isBuiltin: boolean;
	/** 是否有对应的市场行。 */
	fromMarket: boolean;
	market?: MarketAbility;
	searchTerms: string[];
}

export interface SkillAbility extends AbilityBase {
	type: "skill" | "scene";
	/** listSkills 的来源标识（`agents-user` / `builtin` 等）。 */
	skillSource?: string;
}

export interface McpAbility extends AbilityBase {
	type: "mcp";
	/** mcp.json 里的 key。 */
	serverName: string;
	preset?: BuiltinMcpPreset;
	/** bundle 私有内联成员的配置：安装时原样写入 mcpServers[serverName]。 */
	inlineConfig?: Record<string, unknown>;
	usesOAuth: boolean;
	authorized: boolean;
	canConfigure: boolean;
	canEdit: boolean;
}

export interface PluginAbility extends AbilityBase {
	type: "plugin";
	plugin: InstalledPlugin | null;
	/** manifest 声明的权限（未装时取市场快照）。 */
	permissions: PluginPermission[];
	grantedPermissions: PluginPermission[];
	commands: string[];
	grantedCommands: string[];
	pendingVersion?: string;
}

export interface BundleAbility extends AbilityBase {
	type: "bundle";
	members: AbilityMember[];
	/** 已在本地解析出的成员条目；引用不存在时缺项。 */
	memberItems: AbilityItem[];
}

export type AbilityItem = SkillAbility | McpAbility | PluginAbility | BundleAbility;

/** Banner 轮播图标源（与「发现」列表同源）。 */
export interface AbilityBannerIcon {
	id: string;
	/** 无图时按 type 落默认图。 */
	type: AbilityType;
	icon?: string;
}

export interface AbilitiesModel {
	scope: AbilityScope;
	setScope: (scope: AbilityScope) => void;
	typeFilter: AbilityTypeFilter;
	setTypeFilter: (value: AbilityTypeFilter) => void;
	categoryFilter: string;
	setCategoryFilter: (value: string) => void;
	searchQuery: string;
	setSearchQuery: (value: string) => void;
	/** 当前 scope 下可选的分类（含未分类），已去重排序。 */
	categories: string[];
	/** 当前 scope 下各 type 的条目数，用于类型筛选计数。 */
	typeCounts: Record<AbilityType, number>;
	/** 经 scope + 分类 + 类型 + 搜索过滤后的结果。 */
	items: AbilityItem[];
	/** 未经任何过滤的全集，供详情页按 id 查找。 */
	allItems: AbilityItem[];
	bannerIcons: AbilityBannerIcon[];
	loading: boolean;
	refreshing: boolean;
	errors: string[];
	message: string | null;
	importing: boolean;
	mcp: McpSettingsModel;
	findById: (id: string) => AbilityItem | null;
	refresh: () => void;
	install: (item: AbilityItem) => void;
	uninstall: (item: AbilityItem) => void;
	toggle: (item: AbilityItem) => void;
	setup: (item: McpAbility) => void;
	configure: (item: McpAbility) => void;
	edit: (item: McpAbility) => void;
	revokeAuthorization: (item: McpAbility) => void;
	setPluginPermission: (item: PluginAbility, permission: PluginPermission, granted: boolean) => void;
	setPluginCommand: (item: PluginAbility, command: string, granted: boolean) => void;
	reloadPlugin: (item: PluginAbility) => void;
	/** 逐项勾选后卸载 bundle 成员。 */
	uninstallBundleMembers: (members: AbilityItem[]) => void;
	importSkillArchive: (file: File) => void;
	startAddManualMcp: () => void;
}
