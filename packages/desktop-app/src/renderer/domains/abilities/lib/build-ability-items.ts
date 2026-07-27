/**
 * 市场行 + 本地状态 → AbilityItem。全部为纯函数，便于单独推理与测试。
 * installed / localVersion / needsUpdate 一律以安装台账为准（ADR-0049），
 * enabled 才回各自运行时读（skills 清单 / mcp.json / 插件注册表）。
 */
import type {
	AbilityLedger,
	InstalledPlugin,
	InstalledSkill,
	McpConfigData,
	PluginPermission,
	SkillInfo,
} from "@preload/api";
import type { AbilityMember, MarketAbility } from "@shared/lib/api";
import type { TFunction } from "i18next";
import {
	type BuiltinMcpPreset,
	builtinMcpIconUrl,
	getListedBuiltinMcpPresets,
	isBuiltinMcpServer,
	matchBuiltinMcpPreset,
	missingRequiredSecrets,
	resolveMcpIcon,
	serverUsesOAuth,
} from "../../settings/mcp/builtin-mcp-presets";
import type { AbilityItem, BundleAbility, McpAbility, PluginAbility, SkillAbility } from "../types";

/**
 * 解析插件 manifest 里的 `%key%` NLS 占位符（ADR-0033）。已装插件走它自带的
 * catalog；未装的市场条目没有 catalog，回落为裸 key —— 那种情况由服务端在上传时
 * 就把占位符解析成真实文案来兜底，客户端这里不做二次猜测。
 */
export type PluginTextResolver = (pluginId: string, raw: string | undefined) => string;

export interface LocalAbilityState {
	ledger: AbilityLedger;
	skillManifest: Record<string, InstalledSkill>;
	localSkills: SkillInfo[];
	plugins: InstalledPlugin[];
	mcpConfig: McpConfigData | null;
	oauthAuthByName: Record<string, boolean>;
	busyIds: ReadonlySet<string>;
}

function abilityId(type: string, slug: string): string {
	return `${type}:${slug}`;
}

function ledgerVersion(ledger: AbilityLedger, type: string, slug: string): string | undefined {
	return ledger[abilityId(type, slug)]?.version;
}

function terms(...values: Array<string | undefined | string[]>): string[] {
	const out: string[] = [];
	for (const value of values) {
		if (!value) continue;
		if (Array.isArray(value)) out.push(...value.filter(Boolean));
		else out.push(value);
	}
	return out;
}

// ─── skill / scene ───

/** 清单条目的类型，缺省按 skill 处理（早期条目没有 type 字段）。 */
function manifestType(entry: InstalledSkill): "skill" | "scene" {
	return entry.type === "scene" ? "scene" : "skill";
}

export function buildSkillAbilities(market: MarketAbility[], state: LocalAbilityState): SkillAbility[] {
	const { ledger, skillManifest, localSkills, busyIds } = state;
	const items: SkillAbility[] = [];
	const seen = new Set<string>();

	for (const entry of market) {
		if (entry.type !== "skill" && entry.type !== "scene") continue;
		const id = abilityId(entry.type, entry.slug);
		// 本地清单是扁平 map（skill 与 scene 同命名空间），同名不同类型不能互相认领
		const localEntry = skillManifest[entry.slug];
		const local = localEntry && manifestType(localEntry) === entry.type ? localEntry : undefined;
		const localVersion = ledgerVersion(ledger, entry.type, entry.slug) ?? local?.version;
		const installed = Boolean(localVersion) || local?.source === "market";
		seen.add(id);
		items.push({
			type: entry.type,
			id,
			slug: entry.slug,
			title: entry.name || entry.slug,
			description: entry.description,
			icon: entry.icon || undefined,
			category: entry.category,
			tags: entry.tags,
			author: entry.author,
			license: entry.license,
			version: entry.version,
			localVersion,
			sha256: entry.sha256 || undefined,
			installed,
			enabled: installed ? Boolean(local?.enabled) : false,
			readonly: false,
			needsUpdate: installed && Boolean(localVersion) && localVersion !== entry.version,
			setupRequired: false,
			busy: busyIds.has(id),
			downloadCount: entry.download_count,
			isCustom: false,
			isBuiltin: false,
			fromMarket: true,
			market: entry,
			searchTerms: terms(entry.slug, entry.name, entry.description, entry.tags),
		});
	}

	// 本地已装但市场已下架 / 自定义导入的 skill。
	for (const [name, local] of Object.entries(skillManifest)) {
		const type = manifestType(local);
		const id = abilityId(type, name);
		if (seen.has(id)) continue;
		seen.add(id);
		const isCustom = local.source === "custom";
		items.push({
			type,
			id,
			slug: name,
			title: local.alias || name,
			description: local.source === "custom" ? local.description : (local.marketDescription ?? ""),
			category: "",
			tags: [],
			author: "",
			license: "",
			version: local.version,
			localVersion: ledgerVersion(ledger, type, name) ?? local.version,
			installed: true,
			enabled: local.enabled,
			readonly: false,
			needsUpdate: false,
			setupRequired: false,
			busy: busyIds.has(id),
			downloadCount: 0,
			isCustom,
			isBuiltin: false,
			fromMarket: false,
			searchTerms: terms(name, local.alias),
		});
	}

	// 通用 Agent / 内置 skill：只读，不进台账。
	for (const skill of localSkills) {
		const id = abilityId(skill.type, skill.name);
		if (seen.has(id)) continue;
		seen.add(id);
		items.push({
			type: skill.type,
			id,
			slug: skill.name,
			title: skill.alias || skill.name,
			description: skill.description,
			category: "",
			tags: [],
			author: "",
			license: "",
			version: "",
			installed: true,
			enabled: true,
			readonly: true,
			needsUpdate: false,
			setupRequired: false,
			busy: false,
			downloadCount: 0,
			isCustom: false,
			isBuiltin: true,
			fromMarket: false,
			skillSource: skill.source,
			searchTerms: terms(skill.name, skill.alias, skill.description),
		});
	}

	return items;
}

// ─── mcp ───

interface McpBuildInput {
	slug: string;
	preset?: BuiltinMcpPreset;
	entry?: MarketAbility;
}

function createMcpAbility(input: McpBuildInput, state: LocalAbilityState, t: TFunction<"settings">): McpAbility {
	const { slug, entry } = input;
	const servers = state.mcpConfig?.mcpServers ?? {};
	const server = servers[slug];
	const preset = input.preset ?? (server ? matchBuiltinMcpPreset(slug, server) : undefined);
	const id = abilityId("mcp", slug);
	const title = preset ? t(preset.displayNameKey) : server?.displayName || entry?.name || slug;
	const description = preset ? t(preset.descriptionKey) : server?.description?.trim() || entry?.description || "";
	const usesOAuth = server ? serverUsesOAuth(slug, server) : false;
	const authorized = usesOAuth && Boolean(state.oauthAuthByName[slug]);
	const needsSecrets = Boolean(server && preset && missingRequiredSecrets(preset, server).length > 0);
	const installed = Boolean(server);
	const localVersion = ledgerVersion(state.ledger, "mcp", slug);
	const icon = server
		? (resolveMcpIcon(slug, server) ?? entry?.icon)
		: preset
			? builtinMcpIconUrl(preset.iconFile)
			: entry?.icon;

	return {
		type: "mcp",
		id,
		slug,
		serverName: slug,
		title,
		description,
		icon: icon || undefined,
		category: entry?.category ?? "",
		tags: entry?.tags ?? [],
		author: entry?.author ?? "",
		license: entry?.license ?? "",
		version: entry?.version ?? localVersion ?? "",
		localVersion,
		installed,
		enabled: installed && !(server?.disabled ?? false),
		readonly: false,
		needsUpdate: installed && Boolean(entry && localVersion) && localVersion !== entry?.version,
		setupRequired: installed && (needsSecrets || (usesOAuth && !authorized)),
		busy: state.busyIds.has(id),
		downloadCount: entry?.download_count ?? 0,
		isCustom: installed && !preset && !entry,
		isBuiltin: false,
		fromMarket: Boolean(entry),
		market: entry,
		preset,
		usesOAuth,
		authorized,
		canConfigure: installed && Boolean(preset?.secrets?.length),
		canEdit: Boolean(server && !isBuiltinMcpServer(slug, server)),
		searchTerms: terms(slug, title, description, entry?.tags),
	};
}

export function buildMcpAbilities(
	market: MarketAbility[],
	state: LocalAbilityState,
	t: TFunction<"settings">,
): McpAbility[] {
	const marketBySlug = new Map(market.filter((entry) => entry.type === "mcp").map((entry) => [entry.slug, entry]));
	const items: McpAbility[] = [];
	const seen = new Set<string>();

	for (const preset of getListedBuiltinMcpPresets()) {
		seen.add(preset.name);
		items.push(createMcpAbility({ slug: preset.name, preset, entry: marketBySlug.get(preset.name) }, state, t));
	}
	for (const [slug, entry] of marketBySlug) {
		if (seen.has(slug)) continue;
		seen.add(slug);
		items.push(createMcpAbility({ slug, entry }, state, t));
	}
	for (const slug of Object.keys(state.mcpConfig?.mcpServers ?? {})) {
		if (seen.has(slug)) continue;
		seen.add(slug);
		items.push(createMcpAbility({ slug, entry: marketBySlug.get(slug) }, state, t));
	}
	return items;
}

// ─── plugin ───

function toPluginPermissions(values: string[] | undefined): PluginPermission[] {
	return (values ?? []) as PluginPermission[];
}

export function buildPluginAbilities(
	market: MarketAbility[],
	state: LocalAbilityState,
	trPlugin: PluginTextResolver,
): PluginAbility[] {
	const { ledger, plugins, busyIds } = state;
	const installedById = new Map(plugins.map((plugin) => [plugin.id, plugin]));
	const items: PluginAbility[] = [];
	const seen = new Set<string>();

	const create = (slug: string, entry: MarketAbility | undefined, plugin: InstalledPlugin | null): PluginAbility => {
		const id = abilityId("plugin", slug);
		const isSystem = plugin?.source === "system";
		const localVersion = ledgerVersion(ledger, "plugin", slug) ?? plugin?.activeVersion;
		// manifest 的 name/description 可能是 `%key%` NLS 占位符（ADR-0033），必须过 catalog 解析
		const title = trPlugin(slug, plugin?.name ?? entry?.name) || slug;
		const description = trPlugin(slug, plugin?.description ?? entry?.description);
		return {
			type: "plugin",
			id,
			slug,
			title,
			description,
			icon: plugin?.iconUrl ?? entry?.icon ?? undefined,
			category: entry?.category ?? "",
			tags: entry?.tags ?? [],
			author: plugin?.author ?? entry?.author ?? "",
			license: entry?.license ?? "",
			version: entry?.version ?? plugin?.activeVersion ?? "",
			localVersion,
			sha256: entry?.sha256 || undefined,
			installed: plugin !== null,
			enabled: plugin?.enabled ?? false,
			readonly: isSystem || Boolean(plugin?.required),
			needsUpdate: Boolean(plugin) && !isSystem && Boolean(entry && localVersion) && localVersion !== entry?.version,
			setupRequired: false,
			busy: busyIds.has(id),
			downloadCount: entry?.download_count ?? 0,
			isCustom: plugin?.source === "archive",
			isBuiltin: isSystem,
			fromMarket: Boolean(entry),
			market: entry,
			plugin,
			permissions: plugin ? plugin.permissions : toPluginPermissions(entry?.config.permissions),
			grantedPermissions: plugin?.grantedPermissions ?? [],
			commands: plugin ? plugin.declaredCommands : (entry?.config.commands ?? []),
			grantedCommands: plugin?.grantedCommandNames ?? [],
			pendingVersion: plugin?.pendingVersion,
			searchTerms: terms(slug, title, description, entry?.tags),
		};
	};

	for (const entry of market) {
		if (entry.type !== "plugin") continue;
		seen.add(entry.slug);
		items.push(create(entry.slug, entry, installedById.get(entry.slug) ?? null));
	}
	for (const plugin of plugins) {
		if (seen.has(plugin.id)) continue;
		seen.add(plugin.id);
		items.push(create(plugin.id, undefined, plugin));
	}
	return items;
}

// ─── bundle ───

/**
 * bundle 私有内联 mcp 成员：按定义没有市场行，安装前本地 mcp.json 也没有这个 key，
 * 因此在此就地合成条目，配置取 `member.inline`（安装时原样写入 mcpServers[slug]）。
 */
function createInlineMcpAbility(member: AbilityMember, state: LocalAbilityState, t: TFunction<"settings">): McpAbility {
	const base = createMcpAbility({ slug: member.slug }, state, t);
	return {
		...base,
		title: base.installed ? base.title : member.name || member.slug,
		icon: base.icon ?? (member.icon || undefined),
		version: member.version || base.version,
		inlineConfig: member.inline,
	};
}

/** bundle 恒无产物，状态全部由成员派生；不进台账故无独立版本比对。 */
export function buildBundleAbilities(
	market: MarketAbility[],
	members: AbilityItem[],
	state: LocalAbilityState,
	t: TFunction<"settings">,
): BundleAbility[] {
	const byId = new Map(members.map((item) => [item.id, item]));
	const items: BundleAbility[] = [];

	for (const entry of market) {
		if (entry.type !== "bundle") continue;
		const declared = entry.config.members ?? [];
		const resolved = declared.map((member) => {
			const found = byId.get(abilityId(member.type, member.slug));
			if (found) return found;
			return member.type === "mcp" && member.inline ? createInlineMcpAbility(member, state, t) : undefined;
		});
		const memberItems = resolved.filter((item): item is AbilityItem => item !== undefined);
		const installable = memberItems.filter((item) => !item.readonly);
		// 解析不到的成员（已下架 / 未上架）视为未满足，否则 bundle 会假装已装完
		const installed = declared.length > 0 && resolved.every((item) => Boolean(item?.readonly || item?.installed));
		items.push({
			type: "bundle",
			id: abilityId("bundle", entry.slug),
			slug: entry.slug,
			title: entry.name || entry.slug,
			description: entry.description,
			icon: entry.icon || undefined,
			category: entry.category,
			tags: entry.tags,
			author: entry.author,
			license: entry.license,
			version: entry.version,
			installed,
			enabled: installed && installable.every((item) => item.enabled),
			readonly: false,
			needsUpdate: installable.some((item) => item.needsUpdate),
			setupRequired: installable.some((item) => item.installed && item.setupRequired),
			busy: state.busyIds.has(abilityId("bundle", entry.slug)) || installable.some((item) => item.busy),
			downloadCount: entry.download_count,
			isCustom: false,
			isBuiltin: false,
			fromMarket: true,
			market: entry,
			members: declared,
			memberItems,
			searchTerms: terms(entry.slug, entry.name, entry.description, entry.tags),
		});
	}
	return items;
}
