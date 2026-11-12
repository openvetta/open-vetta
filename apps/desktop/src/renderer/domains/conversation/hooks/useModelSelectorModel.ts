import { resolveReasoning } from "@shared/components/ModelSelect/resolveReasoning";
import type { ModelOption } from "@shared/components/ModelSelect/useModelOptions";
import { isValidReasoningLevel, useModelPickerModel } from "@shared/components/ModelSelect/useModelPickerModel";
import {
	activeSessionAtom,
	modelSupportsImagesAtom,
	reasoningByModelAtom,
	SELECTED_MODEL_STORAGE_KEY,
	selectedModelAtom,
} from "@shared/store/atoms";
import type { ModelSelectorViewProps } from "@vetta-org/theme-ui/chat";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";

export interface ModelSelectorModel {
	empty: boolean;
	viewProps: ModelSelectorViewProps;
}

export interface ModelSelectorScope {
	readonly modelKey: string | null;
	readonly reasoning?: string;
	readonly onModelSelect: (modelKey: string, defaultReasoning?: string) => void;
	readonly onReasoningSelect: (reasoning: string) => void;
}

export function persistSelectedModel(key: string): void {
	try {
		localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, key);
	} catch {
		// ignore persistence errors (private mode / quota)
	}
}

/**
 * 输入栏右下角的模型 + 推理档位选择器。目录、分组、文案与视图都来自共享的
 * useModelPickerModel（和设置页、插件里的选择器同一份）；这里只负责输入栏特有的写回：
 * - 选中的模型记为全局「上次使用」，并写进当前会话的 session settings；
 * - 推理档位按模型记忆（reasoningByModelAtom），随 prompt 发出；
 * - 所选模型是否支持图片同步给输入栏。
 * 传入 scope 时（团队成员等局部输入框）改由 scope 持有模型与档位。
 */
export function useModelSelectorModel({
	updateActiveSession = true,
	scope,
}: {
	readonly updateActiveSession?: boolean;
	readonly scope?: ModelSelectorScope;
} = {}): ModelSelectorModel {
	const [globalSelectedModel, setSelectedModel] = useAtom(selectedModelAtom);
	const [reasoningByModel, setReasoningByModel] = useAtom(reasoningByModelAtom);
	const selectedModel = scope ? scope.modelKey : globalSelectedModel;
	const activeSession = useAtomValue(activeSessionAtom);
	const setModelSupportsImages = useSetAtom(modelSupportsImagesAtom);

	const handleModelSelect = useCallback(
		(key: string | null, option: ModelOption | null) => {
			if (!key) return;
			if (scope) scope.onModelSelect(key, resolveReasoning(option)?.default);
			// 用户手动选择的就是“上次使用的模型”，无论在哪个输入框选的都记为全局新会话偏好；
			// 否则 scoped 选择不落全局，刷新后普通输入框会回到一个早已不可用的旧模型。
			// 已有会话另写 session settings。
			setSelectedModel(key);
			persistSelectedModel(key);
			if (!scope && updateActiveSession && activeSession?.runtimeId) {
				void window.vetta.session.updateSettings(activeSession.runtimeId, { modelKey: key });
			}
		},
		[setSelectedModel, activeSession, updateActiveSession, scope],
	);

	const handleReasoningSelect = useCallback(
		(value: string) => {
			if (!selectedModel) return;
			if (scope) scope.onReasoningSelect(value);
			else setReasoningByModel({ ...reasoningByModel, [selectedModel]: value });
		},
		[selectedModel, reasoningByModel, setReasoningByModel, scope],
	);

	const rememberedLevel = selectedModel ? (scope ? scope.reasoning : reasoningByModel[selectedModel]) : undefined;
	const reasoning = useMemo(
		() => ({ value: rememberedLevel, onChange: handleReasoningSelect }),
		[rememberedLevel, handleReasoningSelect],
	);

	const picker = useModelPickerModel({ value: selectedModel, onChange: handleModelSelect, reasoning });
	const { options, globalDefaultKey, catalogOption, resolvedReasoning } = picker;

	// Auto-apply the configured default model when nothing is selected yet.
	useEffect(() => {
		if (selectedModel || !globalDefaultKey) return;
		if (scope) {
			const defaultReasoning = resolveReasoning(options.find((option) => option.key === globalDefaultKey))?.default;
			scope.onModelSelect(globalDefaultKey, defaultReasoning);
		} else {
			setSelectedModel(globalDefaultKey);
			persistSelectedModel(globalDefaultKey);
		}
	}, [selectedModel, globalDefaultKey, setSelectedModel, scope, options]);

	// Keep image-support flag in sync with the resolved catalog selection only.
	useEffect(() => {
		if (options.length === 0) return;
		setModelSupportsImages(catalogOption?.supportsImage ?? false);
	}, [options.length, catalogOption, setModelSupportsImages]);

	// Persist the effective default level for the selected model when none is remembered,
	// so the prompt sender always has a value to send (per-model memory seeded with default).
	useEffect(() => {
		if (scope || !selectedModel || !resolvedReasoning) return;
		const remembered = reasoningByModel[selectedModel];
		if (!remembered || !isValidReasoningLevel(remembered, resolvedReasoning)) {
			setReasoningByModel({ ...reasoningByModel, [selectedModel]: resolvedReasoning.default });
		}
	}, [selectedModel, resolvedReasoning, reasoningByModel, setReasoningByModel, scope]);

	return {
		// 已有选中 key 时即使 options 还在加载也展示触发器，避免空白/占位闪烁。
		empty: picker.empty,
		viewProps: picker.viewProps,
	};
}
