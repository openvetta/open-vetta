import { createContext, useContext } from "react";
import type { ExecutionModeSelectorViewProps } from "./execution-mode-selector/types";

/**
 * 输入栏经它把"该放进模型菜单底栏的东西"交给里面的 ModelSelector，
 * 省得把这些一路经 props 穿过输入栏的各层组装。没有 Provider 时（新会话页以外的
 * 模型选择器）就没有底栏。
 */
export interface ModelSelectorFooterValue {
	/** 沙箱权限选择；放在底栏右侧。 */
	readonly executionMode?: ExecutionModeSelectorViewProps;
	/** 输入栏当前是否可见可用；不可见时不响应唤起模型菜单的快捷键。 */
	readonly active: boolean;
}

const ModelSelectorFooterContext = createContext<ModelSelectorFooterValue | null>(null);

export const ModelSelectorFooterProvider = ModelSelectorFooterContext.Provider;

export function useModelSelectorFooter(): ModelSelectorFooterValue | null {
	return useContext(ModelSelectorFooterContext);
}
