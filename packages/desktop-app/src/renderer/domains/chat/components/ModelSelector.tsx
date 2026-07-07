import { resolveReasoning } from "@shared/components/ModelSelect/resolveReasoning";
import { useModelOptions } from "@shared/components/ModelSelect/useModelOptions";
import { activeSessionAtom, modelSupportsImagesAtom, reasoningByModelAtom, selectedModelAtom } from "@shared/store/atoms";
import { useThemeComponent } from "@vetta/theme-sdk";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ModelSelectorView } from "./model-selector/ModelSelectorView";

/**
 * Combined chat model + reasoning-level picker. The primary menu is the model list;
 * a "推理档位" entry at the top opens a hover submenu on the right to pick the level
 * (including "off" to disable thinking). Reasoning is per-model: each model remembers
 * its last-chosen level (reasoningByModelAtom) and the value rides the prompt.
 */
export function ModelSelector(): JSX.Element {
	const { t } = useTranslation("common");
	const ThemedModelSelectorView = useThemeComponent("chat.modelSelectorView", ModelSelectorView);
	const [selectedModel, setSelectedModel] = useAtom(selectedModelAtom);
	const [reasoningByModel, setReasoningByModel] = useAtom(reasoningByModelAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const setModelSupportsImages = useSetAtom(modelSupportsImagesAtom);
	const { options, grouped, defaultKey, iconFor, labelFor } = useModelOptions();

	const selectedOption = useMemo(() => options.find((m) => m.key === selectedModel) ?? null, [options, selectedModel]);
	const resolved = useMemo(() => resolveReasoning(selectedOption), [selectedOption]);

	// "off" (disable thinking) is always offered for reasoning-capable models, on top of
	// the model's configured/preset levels. When the model explicitly includes "none",
	// it replaces "off" so they never appear together in the dropdown.
	const menuLevels = useMemo(() => {
		if (!resolved) return [];
		if (resolved.levels.includes("none")) {
			return ["none", ...resolved.levels.filter((l) => l !== "none" && l !== "off")];
		}
		return ["off", ...resolved.levels.filter((l) => l !== "off")];
	}, [resolved]);
	const isValidLevel = useCallback(
		(v: string) => v === "off" || v === "none" || (resolved?.levels.includes(v) ?? false),
		[resolved],
	);

	const currentLevel = useMemo(() => {
		if (!selectedModel || !resolved) return undefined;
		const remembered = reasoningByModel[selectedModel];
		return remembered && isValidLevel(remembered) ? remembered : resolved.default;
	}, [selectedModel, resolved, reasoningByModel, isValidLevel]);

	const levelLabel = useCallback(
		(value: string) => t(`modelSelect.reasoningLevel.${value}`, { defaultValue: value }),
		[t],
	);

	// Auto-apply the configured default model when nothing is selected yet.
	useEffect(() => {
		if (!selectedModel && defaultKey) {
			setSelectedModel(defaultKey);
			localStorage.setItem("vetta-selected-model", defaultKey);
		}
	}, [selectedModel, defaultKey, setSelectedModel]);

	// Keep image-support flag in sync with the resolved selection.
	useEffect(() => {
		if (options.length === 0) return;
		setModelSupportsImages(selectedOption?.supportsImage ?? false);
	}, [options.length, selectedOption, setModelSupportsImages]);

	// Persist the effective default level for the selected model when none is remembered,
	// so the prompt sender always has a value to send (per-model memory seeded with default).
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

	if (options.length === 0) return <></>;

	return (
		<ThemedModelSelectorView
			currentLevel={currentLevel}
			defaultKey={defaultKey}
			groups={[...grouped.entries()].map(([provider, models]) => ({
				icon: iconFor(provider),
				label: labelFor(provider),
				models,
				provider,
			}))}
			labels={{
				cloudOnly: t("modelSelect.cloudOnly"),
				defaultBadge: t("modelSelect.defaultBadge"),
				levelLabel,
				modelHeader: t("modelSelect.modelHeader"),
				placeholder: t("modelSelect.placeholder"),
				reasoningHeader: t("modelSelect.reasoningHeader"),
				visionBadge: t("modelSelect.visionBadge"),
			}}
			menuLevels={menuLevels}
			onModelSelect={handleModelSelect}
			onReasoningSelect={handleReasoningSelect}
			selectedModel={selectedModel ?? undefined}
			selectedOption={selectedOption}
		/>
	);
}
