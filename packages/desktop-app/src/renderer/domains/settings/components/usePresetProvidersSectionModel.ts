import type { ModelsConfigData, PresetProviderInfo } from "@preload/api.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

type ProviderEntry = ModelsConfigData["providers"][string];
type ModelCost = { input: number; output: number; cacheRead: number; cacheWrite: number };
type CostLabelKey = "costInput" | "costCacheRead" | "costCacheWrite" | "costOutput";

export interface PresetProviderModelRow {
	id: string;
	name: string;
	contextWindow?: number;
	hasVision: boolean;
	hasReasoning: boolean;
	price: string | null;
}

export interface PresetProviderRow {
	id: string;
	displayName: string;
	api: string;
	baseUrl?: string;
	icon?: string;
	models: NonNullable<ProviderEntry["models"]>;
	modelRows: PresetProviderModelRow[];
	offline: boolean;
	adopted: boolean;
	isOpen: boolean;
	isExpanded: boolean;
	refreshing: boolean;
	/** 模型数右侧的次要文案:已启用显示同步时间,未启用提示填 key。 */
	statusLabel: string | null;
	/** 该行最近一次拉取模型失败的原因。 */
	modelsError: string | null;
}

export interface PresetProvidersSectionLabels {
	title: string;
	loading: string;
	noPresetProviders: string;
	enabled: string;
	deprecated: string;
	collapseModels: string;
	viewModels: string;
	modelsCount: (count: number) => string;
	collapse: string;
	changeKey: string;
	remove: string;
	enable: string;
	apiKeyDirect: (provider: string) => string;
	apiKeyPlaceholder: string;
	save: string;
	noModels: string;
	thinking: string;
	perMillionTokens: string;
	refreshModels: string;
	refreshingModels: string;
	refreshCatalog: string;
	showAllModels: string;
	showAllModelsHint: string;
}

export interface PresetProvidersSectionModel {
	rows: PresetProviderRow[];
	error: string | null;
	loading: boolean;
	/** Per-provider draft API keys (always-visible enable inputs need independent drafts). */
	draftKeys: Record<string, string>;
	saving: boolean;
	labels: PresetProvidersSectionLabels;
	onToggleExpanded: (row: PresetProviderRow) => void;
	onToggleEditor: (row: PresetProviderRow) => void;
	onDraftKeyChange: (rowId: string, key: string) => void;
	onAdopt: (row: PresetProviderRow) => Promise<void>;
	onRemove: (row: PresetProviderRow) => Promise<void>;
	onRefreshModels: (row: PresetProviderRow) => Promise<void>;
	/** 「显示全部模型」开关。关闭时每个系列只留最新一档。 */
	showAllModels: boolean;
	togglingShowAll: boolean;
	onToggleShowAllModels: (showAll: boolean) => Promise<void>;
	/** 手动重拉公共目录(models.dev)。 */
	refreshingCatalog: boolean;
	onRefreshCatalog: () => Promise<void>;
}

export function usePresetProvidersSectionModel({
	config,
	saveConfig,
}: {
	config: ModelsConfigData;
	saveConfig: (config: ModelsConfigData) => Promise<void>;
}): PresetProvidersSectionModel {
	const { t, i18n } = useTranslation("settings");
	const [presets, setPresets] = useState<PresetProviderInfo[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	/** Only used for adopted providers' "change key" panel. */
	const [openId, setOpenId] = useState<string | null>(null);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [draftKeys, setDraftKeys] = useState<Record<string, string>>({});
	const [saving, setSaving] = useState(false);
	const [refreshingId, setRefreshingId] = useState<string | null>(null);
	const [modelsErrors, setModelsErrors] = useState<Record<string, string>>({});
	const [showAllModels, setShowAllModels] = useState(false);
	const [togglingShowAll, setTogglingShowAll] = useState(false);
	const [refreshingCatalog, setRefreshingCatalog] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const result = await window.vetta.models.listPresets();
			setPresets(result.providers);
			setShowAllModels(result.showAllModels);
			// 公共目录连缓存都没有时把原因摆出来,别让用户对着 0 个模型猜。
			if (result.catalogError) {
				console.error(
					`[preset-providers] models.dev 公共目录不可达，已退到随包快照（${result.catalogFetchedAt ?? "?"}）：`,
					result.catalogError,
				);
				const time = result.catalogFetchedAt ? formatSyncedAt(result.catalogFetchedAt, i18n.language) : "?";
				setError(`${t("catalogUnavailable", { time })}（${result.catalogError}）`);
			} else {
				setError(null);
			}
		} catch {
			setError(t("fetchFailed"));
		} finally {
			setLoading(false);
		}
	}, [i18n.language, t]);

	useEffect(() => {
		void load();
		// 目录是后台刷新的:拉到新数据后重新列一遍,不必让用户手动重试。
		return window.vetta.models.onPresetsUpdated(() => void load());
	}, [load]);

	const rows = useMemo(() => {
		const presetIds = new Set(presets.map((preset) => preset.id));
		// 早期由服务端模板采纳、现已不在内置目录里的条目:保留展示,标记为已下线。
		const orphaned: BaseRow[] = Object.entries(config.providers)
			.filter(([id, provider]) => provider.source === "template" && !presetIds.has(id))
			.map(([id, provider]) => ({
				id,
				displayName: provider.displayName ?? id,
				api: provider.api ?? "",
				baseUrl: provider.baseUrl,
				icon: provider.icon,
				models: provider.models ?? [],
				offline: true,
			}));
		const presetRows: BaseRow[] = presets.map((preset) => ({
			id: preset.id,
			displayName: preset.displayName,
			api: preset.api,
			baseUrl: preset.baseUrl,
			icon: preset.icon,
			// 已启用的用账号实际可用的 /models 结果,未启用的展示 models.dev 公共目录。
			models: config.providers[preset.id]?.models ?? preset.catalogModels,
			offline: false,
		}));

		return [...presetRows, ...orphaned].map((row) => {
			const adopted = config.providers[row.id]?.source === "template";
			const syncedAt = config.providers[row.id]?.modelsSyncedAt;
			return {
				...row,
				modelRows: row.models.map((model) => ({
					id: model.id,
					name: model.name || model.id,
					contextWindow: model.contextWindow,
					hasVision: model.input?.includes("image") ?? false,
					hasReasoning: Boolean(model.reasoning),
					price: formatPrice(model.cost, t),
				})),
				adopted,
				isOpen: openId === row.id,
				isExpanded: expandedId === row.id,
				refreshing: refreshingId === row.id,
				statusLabel: adopted
					? syncedAt
						? t("syncedAt", { time: formatSyncedAt(syncedAt, i18n.language) })
						: t("neverSynced")
					: t("catalogModels"),
				modelsError: modelsErrors[row.id] ?? null,
			};
		});
	}, [config.providers, expandedId, i18n.language, modelsErrors, openId, presets, refreshingId, t]);

	const handleToggleEditor = useCallback(
		(row: PresetProviderRow): void => {
			if (row.isOpen) {
				setOpenId(null);
				return;
			}
			setOpenId(row.id);
			setDraftKeys((prev) => ({
				...prev,
				[row.id]: prev[row.id] ?? config.providers[row.id]?.apiKey ?? "",
			}));
		},
		[config.providers],
	);

	const handleToggleExpanded = useCallback((row: PresetProviderRow): void => {
		setExpandedId(row.isExpanded ? null : row.id);
	}, []);

	const handleDraftKeyChange = useCallback((rowId: string, key: string): void => {
		setDraftKeys((prev) => ({ ...prev, [rowId]: key }));
	}, []);

	const adopt = useCallback(
		async (row: PresetProviderRow): Promise<void> => {
			const key = (draftKeys[row.id] ?? "").trim();
			if (!key) return;
			setSaving(true);
			try {
				// 填 key 的同时立刻拉一次上游模型列表;拉失败就先落旧快照(通常为空),行内提示错误。
				const fetched = row.offline ? { models: [], error: undefined } : await refreshModels(row.id, key);
				const entry: ProviderEntry = {
					source: "template",
					templateId: row.id,
					displayName: row.displayName,
					icon: row.icon,
					api: row.api,
					baseUrl: row.baseUrl,
					apiKey: key,
					models: fetched.models.length > 0 ? fetched.models : row.models,
					...(fetched.models.length > 0 ? { modelsSyncedAt: new Date().toISOString() } : {}),
				};
				setModelsErrors((prev) => withError(prev, row.id, fetched.error));
				await saveConfig({
					...config,
					providers: { ...config.providers, [row.id]: entry },
				});
				setOpenId((current) => (current === row.id ? null : current));
				setDraftKeys((prev) => {
					const next = { ...prev };
					delete next[row.id];
					return next;
				});
			} finally {
				setSaving(false);
			}
		},
		[config, draftKeys, saveConfig],
	);

	const refresh = useCallback(
		async (row: PresetProviderRow): Promise<void> => {
			const provider = config.providers[row.id];
			if (!provider?.apiKey) return;
			setRefreshingId(row.id);
			try {
				const result = await refreshModels(row.id);
				setModelsErrors((prev) => withError(prev, row.id, result.error));
				if (result.models.length === 0) return;
				await saveConfig({
					...config,
					providers: {
						...config.providers,
						[row.id]: { ...provider, models: result.models, modelsSyncedAt: new Date().toISOString() },
					},
				});
			} finally {
				setRefreshingId(null);
			}
		},
		[config, saveConfig],
	);

	/**
	 * 切换「显示全部模型」。开关落主进程(后台定时同步也读它),然后重新列一遍公共目录,
	 * 并把已启用服务商的模型列表按新口径重新拉取落盘——否则 models.json 与开关不一致,
	 * 模型选择器还是旧的那一份。
	 */
	const toggleShowAllModels = useCallback(
		async (next: boolean): Promise<void> => {
			setTogglingShowAll(true);
			try {
				await window.vetta.models.setPresetShowAllModels(next);
				setShowAllModels(next);
				const listed = await window.vetta.models.listPresets();
				setPresets(listed.providers);

				const adopted = Object.entries(config.providers).filter(
					([, provider]) => provider.source === "template" && provider.apiKey,
				);
				if (adopted.length === 0) return;
				const refreshed = await Promise.all(adopted.map(async ([id]) => ({ id, result: await refreshModels(id) })));
				const providers = { ...config.providers };
				let changed = false;
				for (const { id, result } of refreshed) {
					const provider = providers[id];
					if (!provider || result.models.length === 0) continue;
					providers[id] = { ...provider, models: result.models, modelsSyncedAt: new Date().toISOString() };
					changed = true;
				}
				if (changed) await saveConfig({ ...config, providers });
			} finally {
				setTogglingShowAll(false);
			}
		},
		[config, saveConfig],
	);

	/** 手动重拉公共目录:清冷却强制重试,失败把原文打进控制台并显示出来。 */
	const refreshCatalog = useCallback(async (): Promise<void> => {
		setRefreshingCatalog(true);
		try {
			const result = await window.vetta.models.refreshPresetCatalog();
			if (result.ok) {
				console.info(`[preset-providers] models.dev 目录已更新，共 ${result.modelCount} 个模型`);
			} else {
				console.error("[preset-providers] 刷新 models.dev 目录失败：", result.error);
			}
			await load();
		} catch (err) {
			console.error("[preset-providers] 刷新 models.dev 目录异常：", err);
		} finally {
			setRefreshingCatalog(false);
		}
	}, [load]);

	const remove = useCallback(
		async (row: PresetProviderRow): Promise<void> => {
			const providers = { ...config.providers };
			delete providers[row.id];
			const defaultModel = config.defaultModel?.startsWith(`${row.id}/`) ? undefined : config.defaultModel;
			await saveConfig({ ...config, defaultModel, providers });
			if (openId === row.id) setOpenId(null);
			setModelsErrors((prev) => withError(prev, row.id, undefined));
			setDraftKeys((prev) => {
				if (!(row.id in prev)) return prev;
				const next = { ...prev };
				delete next[row.id];
				return next;
			});
		},
		[config, openId, saveConfig],
	);

	return {
		rows,
		error,
		loading,
		draftKeys,
		saving,
		labels: {
			title: t("presetProviders"),
			loading: t("loading"),
			noPresetProviders: t("noPresetProviders"),
			enabled: t("enabled"),
			deprecated: t("deprecated"),
			collapseModels: t("collapseModels"),
			viewModels: t("viewModels"),
			modelsCount: (count: number) => t("modelsCount", { count }),
			collapse: t("collapse"),
			changeKey: t("changeKey"),
			remove: t("remove"),
			enable: t("enable"),
			apiKeyDirect: (provider: string) => t("apiKeyDirect", { provider }),
			apiKeyPlaceholder: t("presetApiKeyPlaceholder"),
			save: t("save"),
			noModels: t("noModels"),
			thinking: t("thinking"),
			perMillionTokens: t("perMillionTokens"),
			refreshModels: t("refreshModels"),
			refreshingModels: t("refreshingModels"),
			refreshCatalog: t("refreshCatalog"),
			showAllModels: t("showAllModels"),
			showAllModelsHint: t("showAllModelsHint"),
		},
		onToggleExpanded: handleToggleExpanded,
		onToggleEditor: handleToggleEditor,
		onDraftKeyChange: handleDraftKeyChange,
		onAdopt: adopt,
		onRemove: remove,
		onRefreshModels: refresh,
		showAllModels,
		togglingShowAll,
		onToggleShowAllModels: toggleShowAllModels,
		refreshingCatalog,
		onRefreshCatalog: refreshCatalog,
	};
}

interface BaseRow {
	id: string;
	displayName: string;
	api: string;
	baseUrl?: string;
	icon?: string;
	models: NonNullable<ProviderEntry["models"]>;
	offline: boolean;
}

async function refreshModels(
	providerId: string,
	apiKey?: string,
): Promise<{ models: NonNullable<ProviderEntry["models"]>; error?: string }> {
	try {
		return await window.vetta.models.refreshPresetModels(providerId, apiKey);
	} catch (err) {
		return { models: [], error: err instanceof Error ? err.message : String(err) };
	}
}

function withError(prev: Record<string, string>, id: string, error: string | undefined): Record<string, string> {
	if (error) return { ...prev, [id]: error };
	if (!(id in prev)) return prev;
	const next = { ...prev };
	delete next[id];
	return next;
}

function formatSyncedAt(iso: string, locale: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
}

function formatPrice(cost: ModelCost | undefined, t: (key: CostLabelKey) => string): string | null {
	if (!cost) return null;
	const num = (n: number) => (Number.isInteger(n) ? String(n) : parseFloat(n.toFixed(6)).toString());
	const parts: string[] = [];
	if (cost.input) parts.push(`${t("costInput")} $${num(cost.input)}`);
	if (cost.cacheRead) parts.push(`${t("costCacheRead")} $${num(cost.cacheRead)}`);
	if (cost.cacheWrite) parts.push(`${t("costCacheWrite")} $${num(cost.cacheWrite)}`);
	if (cost.output) parts.push(`${t("costOutput")} $${num(cost.output)}`);
	if (parts.length === 0) return null;
	return parts.join(" · ");
}
