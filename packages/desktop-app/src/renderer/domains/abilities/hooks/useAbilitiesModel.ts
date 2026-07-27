/**
 * 能力页统一模型：数据源（useAbilityData）+ 操作层（useAbilityActions）+ 正交两轴过滤。
 * 五种 type 共用同一份条目集合，列表页与详情页都从这里取。
 */
import type { AbilityType } from "@shared/lib/api";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePluginTextResolver } from "../../plugins/runtime/plugin-i18n";
import { useMcpSettingsModel } from "../../settings/components/useMcpSettingsModel";
import {
	buildBundleAbilities,
	buildMcpAbilities,
	buildPluginAbilities,
	buildSkillAbilities,
	type LocalAbilityState,
} from "../lib/build-ability-items";
import {
	ABILITY_CATEGORY_ALL,
	ABILITY_CATEGORY_UNCATEGORIZED,
	ABILITY_TYPES,
	type AbilitiesModel,
	type AbilityBannerIcon,
	type AbilityItem,
	type AbilityScope,
	type AbilityTypeFilter,
} from "../types";
import { useAbilityActions } from "./useAbilityActions";
import { useAbilityData } from "./useAbilityData";

/** 排序：待配置 > 可更新 > 已安装 > 热度 > 标题。 */
function compareAbilities(a: AbilityItem, b: AbilityItem): number {
	if (a.setupRequired !== b.setupRequired) return a.setupRequired ? -1 : 1;
	if (a.needsUpdate !== b.needsUpdate) return a.needsUpdate ? -1 : 1;
	if (a.installed !== b.installed) return a.installed ? -1 : 1;
	if (a.downloadCount !== b.downloadCount) return b.downloadCount - a.downloadCount;
	return a.title.localeCompare(b.title);
}

function matchesScope(item: AbilityItem, scope: AbilityScope): boolean {
	return scope === "discover" ? item.fromMarket : item.installed;
}

export function useAbilitiesModel(): AbilitiesModel {
	const { t } = useTranslation("settings");
	const [scope, setScope] = useState<AbilityScope>("discover");
	const [typeFilter, setTypeFilter] = useState<AbilityTypeFilter>("all");
	const [categoryFilter, setCategoryFilter] = useState<string>(ABILITY_CATEGORY_ALL);
	const [searchQuery, setSearchQuery] = useState("");

	const data = useAbilityData();
	const trPlugin = usePluginTextResolver();
	const mcp = useMcpSettingsModel();
	const actions = useAbilityActions({ mcp, refresh: data.refresh });

	const localState = useMemo<LocalAbilityState>(
		() => ({
			ledger: data.ledger,
			skillManifest: data.skillManifest,
			localSkills: data.localSkills,
			plugins: data.plugins,
			mcpConfig: mcp.config,
			oauthAuthByName: mcp.oauthAuthByName,
			busyIds: actions.busyIds,
		}),
		[
			actions.busyIds,
			data.ledger,
			data.localSkills,
			data.plugins,
			data.skillManifest,
			mcp.config,
			mcp.oauthAuthByName,
		],
	);

	const allItems = useMemo<AbilityItem[]>(() => {
		const singles: AbilityItem[] = [
			...buildSkillAbilities(data.market, localState),
			...buildMcpAbilities(data.market, localState, t),
			...buildPluginAbilities(data.market, localState, trPlugin),
		];
		return [...singles, ...buildBundleAbilities(data.market, singles, localState, t)];
	}, [data.market, localState, t, trPlugin]);

	const scoped = useMemo(() => allItems.filter((item) => matchesScope(item, scope)), [allItems, scope]);

	const categories = useMemo(() => {
		const named = new Set<string>();
		let hasUncategorized = false;
		for (const item of scoped) {
			if (item.category) named.add(item.category);
			else hasUncategorized = true;
		}
		const sorted = Array.from(named).sort((a, b) => a.localeCompare(b));
		return hasUncategorized ? [...sorted, ABILITY_CATEGORY_UNCATEGORIZED] : sorted;
	}, [scoped]);

	const typeCounts = useMemo(() => {
		const counts = Object.fromEntries(ABILITY_TYPES.map((type) => [type, 0])) as Record<AbilityType, number>;
		for (const item of scoped) counts[item.type] += 1;
		return counts;
	}, [scoped]);

	const items = useMemo(() => {
		const normalized = searchQuery.trim().toLowerCase();
		return scoped
			.filter((item) => {
				if (typeFilter !== "all" && item.type !== typeFilter) return false;
				if (categoryFilter !== ABILITY_CATEGORY_ALL) {
					const itemCategory = item.category || ABILITY_CATEGORY_UNCATEGORIZED;
					if (itemCategory !== categoryFilter) return false;
				}
				if (!normalized) return true;
				return item.searchTerms.some((term) => term.toLowerCase().includes(normalized));
			})
			.sort(compareAbilities);
	}, [categoryFilter, scoped, searchQuery, typeFilter]);

	const bannerIcons = useMemo<AbilityBannerIcon[]>(
		() =>
			allItems.filter((item) => item.fromMarket).map((item) => ({ id: item.id, type: item.type, icon: item.icon })),
		[allItems],
	);

	const findById = useCallback((id: string) => allItems.find((item) => item.id === id) ?? null, [allItems]);

	const errors = useMemo(
		() => Array.from(new Set([data.error, actions.error].filter((value): value is string => Boolean(value)))),
		[actions.error, data.error],
	);

	return {
		scope,
		setScope,
		typeFilter,
		setTypeFilter,
		categoryFilter,
		setCategoryFilter,
		searchQuery,
		setSearchQuery,
		categories,
		typeCounts,
		items,
		allItems,
		bannerIcons,
		loading: data.loading || mcp.config === null,
		refreshing: data.refreshing,
		errors,
		message: actions.message,
		importing: actions.importing,
		mcp,
		findById,
		refresh: data.refresh,
		install: actions.install,
		uninstall: actions.uninstall,
		toggle: actions.toggle,
		setup: (item) => {
			if (item.canConfigure && item.preset) {
				mcp.onConfigureBuiltinSecrets(item.serverName);
				return;
			}
			if (item.usesOAuth && !item.authorized) void mcp.onAuthorizeOAuth(item.serverName);
		},
		configure: (item) => mcp.onConfigureBuiltinSecrets(item.serverName),
		edit: (item) => mcp.onToggleEditServer(item.serverName),
		revokeAuthorization: (item) => {
			void mcp.onRevokeOAuth(item.serverName);
		},
		setPluginPermission: actions.setPluginPermission,
		setPluginCommand: actions.setPluginCommand,
		reloadPlugin: actions.reloadPlugin,
		uninstallBundleMembers: actions.uninstallMembers,
		importSkillArchive: actions.importSkillArchive,
		startAddManualMcp: () => mcp.onStartAddServer(),
	};
}
