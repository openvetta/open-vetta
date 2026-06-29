import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { selectedModelAtom, activeSessionAtom, modelSupportsImagesAtom } from "@shared/store/atoms";
import { ModelSelect, type ModelOption } from "@shared/components/ModelSelect";

export function ModelSelector(): JSX.Element {
	const [selectedModel, setSelectedModel] = useAtom(selectedModelAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const setModelSupportsImages = useSetAtom(modelSupportsImagesAtom);

	const handleChange = useCallback(
		(key: string | null) => {
			if (!key) return;
			setSelectedModel(key);
			localStorage.setItem("vetta-selected-model", key);
			// Notify backend to switch model on the active session
			if (activeSession?.runtimeId) {
				void window.vetta.session.updateSettings(activeSession.runtimeId, { modelKey: key });
			}
		},
		[setSelectedModel, activeSession],
	);

	// 选中项变化时同步图片支持状态(含首次加载),修复欢迎页非视觉模型图片按钮可点的问题。
	const handleSelectedOption = useCallback(
		(option: ModelOption | null) => {
			setModelSupportsImages(option?.supportsImage ?? false);
		},
		[setModelSupportsImages],
	);

	return (
		<ModelSelect
			value={selectedModel}
			onChange={handleChange}
			autoSelectDefault
			onSelectedOptionChange={handleSelectedOption}
			triggerClassName="rounded-full border-transparent px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
		/>
	);
}
