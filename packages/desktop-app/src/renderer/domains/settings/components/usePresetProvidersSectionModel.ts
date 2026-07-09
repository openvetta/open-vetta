import type { ModelsConfigData, ProviderTemplate } from "@preload/api.js";
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
}

export interface PresetProvidersSectionLabels {
	title: string;
	refresh: string;
	refreshing: string;
	clickRetry: string;
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
	save: string;
	noModels: string;
	thinking: string;
	perMillionTokens: string;
}

export interface PresetProvidersSectionModel {
	rows: PresetProviderRow[];
	error: string | null;
	loading: boolean;
	draftKey: string;
	saving: boolean;
	labels: PresetProvidersSectionLabels;
	onReload: () => Promise<void>;
	onToggleExpanded: (row: PresetProviderRow) => void;
	onToggleEditor: (row: PresetProviderRow) => void;
	onDraftKeyChange: (key: string) => void;
	onAdopt: (row: PresetProviderRow) => Promise<void>;
	onRemove: (row: PresetProviderRow) => Promise<void>;
}

export function usePresetProvidersSectionModel({
	config,
	saveConfig,
}: {
	config: ModelsConfigData;
	saveConfig: (config: ModelsConfigData) => Promise<void>;
}): PresetProvidersSectionModel {
	const { t } = useTranslation("settings");
	const [templates, setTemplates] = useState<ProviderTemplate[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [openId, setOpenId] = useState<string | null>(null);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [draftKey, setDraftKey] = useState("");
	const [saving, setSaving] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const result = await window.vetta.models.fetchTemplates();
			setTemplates(result.templates);
			if (result.error) setError(result.error);
		} catch {
			setError(t("fetchFailed"));
		} finally {
			setLoading(false);
		}
	}, [t]);

	useEffect(() => {
		void load();
	}, [load]);

	const rows = useMemo(() => {
		const liveIds = new Set(templates.map((template) => template.id));
		const orphaned: TemplateRow[] = Object.entries(config.providers)
			.filter(([id, provider]) => provider.source === "template" && !liveIds.has(id))
			.map(([id, provider]) => ({
				id,
				displayName: id,
				api: provider.api ?? "",
				baseUrl: provider.baseUrl,
				icon: provider.icon,
				models: provider.models ?? [],
				offline: true,
			}));
		const templateRows: TemplateRow[] = templates.map((template) => ({
			id: template.id,
			displayName: template.displayName,
			api: template.api,
			baseUrl: template.baseUrl,
			icon: template.icon,
			models: template.models,
			offline: false,
		}));

		return [...templateRows, ...orphaned].map((row) => ({
			...row,
			modelRows: row.models.map((model) => ({
				id: model.id,
				name: model.name || model.id,
				contextWindow: model.contextWindow,
				hasVision: model.input?.includes("image") ?? false,
				hasReasoning: Boolean(model.reasoning),
				price: formatPrice(model.cost, t),
			})),
			adopted: config.providers[row.id]?.source === "template",
			isOpen: openId === row.id,
			isExpanded: expandedId === row.id,
		}));
	}, [config.providers, expandedId, openId, t, templates]);

	const startEdit = useCallback(
		(row: PresetProviderRow): void => {
			setOpenId(row.id);
			setDraftKey(config.providers[row.id]?.apiKey ?? "");
		},
		[config.providers],
	);

	const handleToggleEditor = useCallback(
		(row: PresetProviderRow): void => {
			if (row.isOpen) {
				setOpenId(null);
				return;
			}
			startEdit(row);
		},
		[startEdit],
	);

	const handleToggleExpanded = useCallback((row: PresetProviderRow): void => {
		setExpandedId(row.isExpanded ? null : row.id);
	}, []);

	const adopt = useCallback(
		async (row: PresetProviderRow): Promise<void> => {
			const key = draftKey.trim();
			if (!key) return;
			setSaving(true);
			try {
				const entry: ProviderEntry = {
					source: "template",
					templateId: row.id,
					displayName: row.displayName,
					icon: row.icon,
					api: row.api,
					baseUrl: row.baseUrl,
					apiKey: key,
					models: row.models,
				};
				await saveConfig({
					...config,
					providers: { ...config.providers, [row.id]: entry },
				});
				setOpenId(null);
				setDraftKey("");
			} finally {
				setSaving(false);
			}
		},
		[config, draftKey, saveConfig],
	);

	const remove = useCallback(
		async (row: PresetProviderRow): Promise<void> => {
			const providers = { ...config.providers };
			delete providers[row.id];
			const defaultModel = config.defaultModel?.startsWith(`${row.id}/`) ? undefined : config.defaultModel;
			await saveConfig({ ...config, defaultModel, providers });
			if (openId === row.id) setOpenId(null);
		},
		[config, openId, saveConfig],
	);

	return {
		rows,
		error,
		loading,
		draftKey,
		saving,
		labels: {
			title: t("presetProviders"),
			refresh: t("refresh"),
			refreshing: t("refreshing"),
			clickRetry: t("clickRetry"),
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
			save: t("save"),
			noModels: t("noModels"),
			thinking: t("thinking"),
			perMillionTokens: t("perMillionTokens"),
		},
		onReload: load,
		onToggleExpanded: handleToggleExpanded,
		onToggleEditor: handleToggleEditor,
		onDraftKeyChange: setDraftKey,
		onAdopt: adopt,
		onRemove: remove,
	};
}

interface TemplateRow {
	id: string;
	displayName: string;
	api: string;
	baseUrl?: string;
	icon?: string;
	models: NonNullable<ProviderEntry["models"]>;
	offline: boolean;
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
