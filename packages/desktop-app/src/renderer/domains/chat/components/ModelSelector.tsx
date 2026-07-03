import { useThemeComponent } from "@vetta/theme-sdk";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { resolveReasoning } from "@shared/components/ModelSelect/resolveReasoning";
import { useModelOptions } from "@shared/components/ModelSelect/useModelOptions";
import { activeSessionAtom, modelSupportsImagesAtom, reasoningByModelAtom, selectedModelAtom } from "@shared/store/atoms";
import { ModelSelectorView } from "./model-selector/ModelSelectorView";
import type { ModelSelectorProviderGroup, ModelSelectorViewProps } from "./model-selector/types";

export function ModelSelector(): JSX.Element {
	const { t } = useTranslation("common");
	const [selectedModel, setSelectedModel] = useAtom(selectedModelAtom);
	const [reasoningByModel, setReasoningByModel] = useAtom(reasoningByModelAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const setModelSupportsImages = useSetAtom(modelSupportsImagesAtom);
	const { options, grouped, defaultKey, iconFor, labelFor } = useModelOptions();
	const ThemedModelSelectorView = useThemeComponent("chat.modelSelectorView", ModelSelectorView);

	const selectedOption = useMemo(() => options.find((m) => m.key === selectedModel) ?? null, [options, selectedModel]);
	const resolved = useMemo(() => resolveReasoning(selectedOption), [selectedOption]);
	const menuLevels = useMemo(() => (resolved ? ["off", ...resolved.levels] : []), [resolved]);
	const isValidLevel = useCallback((v: string) => v === "off" || (resolved?.levels.includes(v) ?? false), [resolved]);

	const currentLevel = useMemo(() => {
		if (!selectedModel || !resolved) return undefined;
		const remembered = reasoningByModel[selectedModel];
		return remembered && isValidLevel(remembered) ? remembered : resolved.default;
	}, [selectedModel, resolved, reasoningByModel, isValidLevel]);

	useEffect(() => {
		if (!selectedModel && defaultKey) {
			setSelectedModel(defaultKey);
			localStorage.setItem("vetta-selected-model", defaultKey);
		}
	}, [selectedModel, defaultKey, setSelectedModel]);

	useEffect(() => {
		if (options.length === 0) return;
		setModelSupportsImages(selectedOption?.supportsImage ?? false);
	}, [options.length, selectedOption, setModelSupportsImages]);

	useEffect(() => {
		if (!selectedModel || !resolved) return;
		const remembered = reasoningByModel[selectedModel];
		if (!remembered || !isValidLevel(remembered)) {
			setReasoningByModel({ ...reasoningByModel, [selectedModel]: resolved.default });
		}
	}, [selectedModel, resolved, reasoningByModel, setReasoningByModel, isValidLevel]);

	const handleModelSelect = useCallback(
		(key: string) => {
			setSelectedModel(key);
			if (activeSession?.runtimeId) {
				void window.vetta.session.updateSettings(activeSession.runtimeId, { modelKey: key });
			}
		},
		[setSelectedModel, activeSession],
	);

	const handleReasoningSelect = useCallback(
		(value: string) => {
			if (!selectedModel) return;
			setReasoningByModel({ ...reasoningByModel, [selectedModel]: value });
		},
		[selectedModel, reasoningByModel, setReasoningByModel],
	);

	const groups = useMemo(
		(): ModelSelectorProviderGroup[] =>
			[...grouped.entries()].map(([provider, providerModels]) => ({
				provider,
				models: providerModels,
				icon: iconFor(provider),
				label: labelFor(provider),
			})),
		[grouped, iconFor, labelFor],
	);

	if (options.length === 0) return <></>;

	const viewProps: ModelSelectorViewProps = {
		selectedModel: selectedModel ?? undefined,
		selectedOption,
		currentLevel,
		menuLevels,
		groups,
		defaultKey,
		labels: {
			placeholder: t("modelSelect.placeholder"),
			reasoningHeader: t("modelSelect.reasoningHeader"),
			modelHeader: t("modelSelect.modelHeader"),
			cloudOnly: t("modelSelect.cloudOnly"),
			visionBadge: t("modelSelect.visionBadge"),
			defaultBadge: t("modelSelect.defaultBadge"),
			levelLabel: (value) => t(`modelSelect.reasoningLevel.${value}`, { defaultValue: value }),
		},
		onModelSelect: handleModelSelect,
		onReasoningSelect: handleReasoningSelect,
	};

	return <ThemedModelSelectorView {...viewProps} />;
}

export type { ModelSelectorViewProps } from "./model-selector/types";
