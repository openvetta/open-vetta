import { favoriteModelsAtom } from "@shared/store/atoms";
import { modelCatalog } from "@shared/store/model-catalog";
import type { ModelSelectorViewProps } from "@vetta-org/theme-ui/chat";
import { fmtMultiplier } from "@vetta-org/theme-ui/shared/MultiplierTag";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { type ResolvedReasoning, resolveReasoning } from "./resolveReasoning";
import { type ModelOption, useModelOptions } from "./useModelOptions";

/** 推理档位的受控值；不传就不出现第三栏。 */
export interface ModelPickerReasoning {
	/** 当前档位；无效或缺省时按所选模型的默认档位显示。 */
	readonly value: string | undefined;
	readonly onChange: (level: string) => void;
}

export interface UseModelPickerModelOptions {
	/** 当前选中的 `provider/modelId`；null 表示未选。 */
	readonly value: string | null;
	/**
	 * 选中回调。`option` 是目录里的那一项（选空值项时为 null），调用方可据此取默认推理档位。
	 * 只有提供了 `emptyOption` 时 key 才会是 null。
	 */
	readonly onChange: (key: string | null, option: ModelOption | null) => void;
	readonly reasoning?: ModelPickerReasoning;
	/** 列表顶部的空值项（「不固定模型」「跟随默认」）。 */
	readonly emptyOption?: { readonly label: string };
	/** 未选中时触发器上的文案；缺省为「选择模型」。 */
	readonly placeholder?: string;
	/** 打「默认」徽章的模型；缺省为用户配置的全局默认模型。 */
	readonly defaultKey?: string;
	/** 未选中时自动选上全局默认模型（只触发一次 onChange）。 */
	readonly autoSelectDefault?: boolean;
}

export interface ModelPickerModel {
	/** 目录为空、没有选中值、也没有空值项：没东西可画。 */
	readonly empty: boolean;
	readonly options: readonly ModelOption[];
	/** 用户配置的全局默认模型（所属服务商被停用时为 undefined）。 */
	readonly globalDefaultKey: string | undefined;
	/** 目录里真实存在的选中项；目录未就绪或模型已下架时为 null。 */
	readonly catalogOption: ModelOption | null;
	readonly resolvedReasoning: ResolvedReasoning | null;
	readonly viewProps: ModelSelectorViewProps;
}

/**
 * 宿主唯一的模型选择器连接层：读同一份模型目录（本地 models.json + 登录后的远程目录），
 * 拼出 ModelSelectorView 需要的分组、文案、收藏、推理档位与计费倍率。
 *
 * 输入栏、设置页、审批卡、团队成员、插件（经 host bridge）都从这里取 props，
 * 选择器因此只有一个数据口径与一副样子；各处只决定「选中的值写到哪」。
 */
export function useModelPickerModel({
	value,
	onChange,
	reasoning,
	emptyOption,
	placeholder,
	defaultKey: defaultKeyOverride,
	autoSelectDefault = false,
}: UseModelPickerModelOptions): ModelPickerModel {
	const { t } = useTranslation("common");
	const { options, grouped, defaultKey: globalDefaultKey, iconFor, labelFor } = useModelOptions();
	const defaultKey = defaultKeyOverride ?? globalDefaultKey;
	const optionByKey = useMemo(() => new Map(options.map((option) => [option.key, option])), [options]);

	// 回调经 ref 取最新值：调用方常传内联函数，不该因此让视图的 memo 失效。
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const reasoningChangeRef = useRef(reasoning?.onChange);
	reasoningChangeRef.current = reasoning?.onChange;

	const catalogOption = value ? (optionByKey.get(value) ?? null) : null;
	// 有 key 但目录未就绪（或模型已下架）时仍显示 modelId，避免闪「选择模型」或误显示成空值项。
	const selectedOption = useMemo(
		() => catalogOption ?? (value ? fallbackOptionFromKey(value) : null),
		[catalogOption, value],
	);
	const hasReasoning = reasoning !== undefined;
	// 推理档位只认目录里的真实配置，fallback option 不参与。
	const resolved = useMemo(
		() => (hasReasoning ? resolveReasoning(catalogOption) : null),
		[hasReasoning, catalogOption],
	);
	const menuLevels = useMemo(() => reasoningMenuLevels(resolved), [resolved]);
	const currentLevel = resolved
		? reasoning?.value && isValidReasoningLevel(reasoning.value, resolved)
			? reasoning.value
			: resolved.default
		: undefined;

	useEffect(() => {
		if (!autoSelectDefault || value || !globalDefaultKey) return;
		onChangeRef.current(globalDefaultKey, optionByKey.get(globalDefaultKey) ?? null);
	}, [autoSelectDefault, value, globalDefaultKey, optionByKey]);

	const handleModelSelect = useCallback(
		(key: string) => onChangeRef.current(key, optionByKey.get(key) ?? null),
		[optionByKey],
	);
	const handleReasoningSelect = useCallback((level: string) => reasoningChangeRef.current?.(level), []);
	// 打开菜单时按 TTL 后台重校验目录，服务端增删模型无需重启即可看到。
	const handleOpenChange = useCallback((open: boolean) => {
		if (open) void modelCatalog.revalidate();
	}, []);

	const emptyLabel = emptyOption?.label;
	const viewEmptyOption = useMemo(
		() =>
			emptyLabel === undefined ? undefined : { label: emptyLabel, onSelect: () => onChangeRef.current(null, null) },
		[emptyLabel],
	);

	// 选中后菜单要保持打开、让用户接着在第三栏选思考强度的模型；没有推理档位的选择器不需要。
	const reasoningModelKeys = useMemo(
		() =>
			hasReasoning
				? new Set(options.filter((option) => resolveReasoning(option)).map((option) => option.key))
				: undefined,
		[hasReasoning, options],
	);

	const levelLabel = useCallback(
		(level: string) => t(`modelSelect.reasoningLevel.${level}`, { defaultValue: level }),
		[t],
	);
	/** 计费倍率的口径与「免费」措辞属于宿主，视图只负责渲染。 */
	const multiplierLabel = useCallback(
		(option: { key: string }): string | undefined => {
			const multiplier = optionByKey.get(option.key)?.multiplier;
			if (!multiplier) return undefined;
			return multiplier.input === 0 && multiplier.output === 0
				? t("modelSelect.free")
				: t("modelSelect.multiplier", { value: fmtMultiplier(multiplier.input) });
		},
		[optionByKey, t],
	);

	const [favoriteKeyList, setFavoriteKeyList] = useAtom(favoriteModelsAtom);
	const favoriteKeys = useMemo(() => new Set(favoriteKeyList), [favoriteKeyList]);
	const toggleFavorite = useCallback(
		(key: string) =>
			setFavoriteKeyList((current) =>
				current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
			),
		[setFavoriteKeyList],
	);
	const favorites = useMemo<NonNullable<ModelSelectorViewProps["favorites"]>>(
		() => ({
			keys: favoriteKeys,
			onToggle: toggleFavorite,
			labels: {
				tab: t("modelSelect.favorites.tab"),
				empty: t("modelSelect.favorites.empty"),
				add: t("modelSelect.favorites.add"),
				remove: t("modelSelect.favorites.remove"),
			},
		}),
		[favoriteKeys, toggleFavorite, t],
	);

	// 引用保持稳定：视图里的搜索过滤、行组件的 memo 都依赖它们不随无关状态换新。
	const groups = useMemo(
		() =>
			[...grouped.entries()].map(([provider, models]) => ({
				icon: iconFor(provider),
				label: labelFor(provider),
				models,
				provider,
			})),
		[grouped, iconFor, labelFor],
	);
	const labels = useMemo<ModelSelectorViewProps["labels"]>(
		() => ({
			clearSearch: t("modelSelect.clearSearch"),
			multiplierLabel,
			cloudOnly: t("modelSelect.cloudOnly"),
			defaultBadge: t("modelSelect.defaultBadge"),
			levelLabel,
			moreProviders: (count) => t("modelSelect.moreProviders", { count }),
			fewerProviders: t("modelSelect.fewerProviders"),
			modelHeader: t("modelSelect.modelHeader"),
			noResults: t("modelSelect.noResults"),
			noResultsHint: t("modelSelect.noResultsHint"),
			placeholder: placeholder ?? t("modelSelect.placeholder"),
			reasoningHeader: t("modelSelect.reasoningHeader"),
			searchPlaceholder: t("modelSelect.searchPlaceholder"),
			visionBadge: t("modelSelect.visionBadge"),
			info: {
				button: t("modelSelect.info.button"),
				source: t("modelSelect.info.source"),
				id: t("modelSelect.info.id"),
				contextWindow: t("modelSelect.info.contextWindow"),
				maxOutput: t("modelSelect.info.maxOutput"),
				inputModes: t("modelSelect.info.inputModes"),
				reasoning: t("modelSelect.info.reasoning"),
				reasoningSupported: t("modelSelect.info.reasoningSupported"),
				multiplier: t("modelSelect.info.multiplier"),
				modality: (modality: string) => t(`modelSelect.info.modality.${modality}`, { defaultValue: modality }),
			},
		}),
		[t, multiplierLabel, levelLabel, placeholder],
	);

	return {
		empty: options.length === 0 && !value && !emptyOption,
		options,
		globalDefaultKey,
		catalogOption,
		resolvedReasoning: resolved,
		viewProps: {
			currentLevel,
			defaultKey,
			emptyOption: viewEmptyOption,
			favorites,
			groups,
			labels,
			menuLevels,
			onModelSelect: handleModelSelect,
			onOpenChange: handleOpenChange,
			onReasoningSelect: handleReasoningSelect,
			reasoningModelKeys,
			selectedModel: value ?? undefined,
			selectedOption,
		},
	};
}

/** 目录尚未加载出该 key 时，拼一个最小 option 供触发器展示。 */
export function fallbackOptionFromKey(key: string): ModelOption {
	const slash = key.indexOf("/");
	const provider = slash > 0 ? key.slice(0, slash) : key;
	const modelId = slash > 0 ? key.slice(slash + 1) : key;
	return { provider, modelId, displayName: modelId, key };
}

/**
 * 菜单里列出的档位。「关闭思考」总是提供；模型自己声明了 "none" 时由它替代 "off"，两者不同时出现。
 */
export function reasoningMenuLevels(resolved: ResolvedReasoning | null): string[] {
	if (!resolved) return [];
	if (resolved.levels.includes("none")) {
		return ["none", ...resolved.levels.filter((level) => level !== "none" && level !== "off")];
	}
	return ["off", ...resolved.levels.filter((level) => level !== "off")];
}

export function isValidReasoningLevel(level: string, resolved: ResolvedReasoning): boolean {
	return level === "off" || level === "none" || resolved.levels.includes(level);
}
