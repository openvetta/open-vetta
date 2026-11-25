import { inputValueAtom, promptSuggestionDismissedAtom, promptSuggestionsAtom } from "@shared/store/atoms";
import { useAtomValue, useStore } from "jotai";
import { useCallback, useEffect } from "react";

export interface InlinePromptSuggestionOptions {
	readonly runtimeId?: string;
	readonly hasSession: boolean;
	readonly isStreaming: boolean;
	/** 输入框一个字符都没有（含空格即为 false）。 */
	readonly placeholderVisible: boolean;
}

export interface InlinePromptSuggestion {
	/** 还没被放弃的第一条预测；输入框为空时显示在占位层。 */
	readonly suggestion: string | undefined;
	/** 此刻是否正显示在输入框里。 */
	readonly visible: boolean;
	/** Tab 填入、Esc 放弃；认领了按键返回 true。 */
	readonly handleKeyDown: (event: KeyboardEvent) => boolean;
}

/**
 * 输入框里的「下一句」预测：第一条预测以淡色显示在空输入框里，不写进编辑器。
 *
 * - Tab：把它写进输入框，光标落在末尾，不发送。
 * - 打字、粘贴、加附件（输入框不再为空）或 Esc：视为不接受，这一轮不再出现，删回空也不回来。
 * - 预测返回时输入框已经有字：直接视为不接受。
 *
 * 不真正预填进编辑器，是为了不让未确认的预测被回车误发、被当成草稿保存、或干扰 ↑ 翻历史。
 */
export function useInlinePromptSuggestion({
	runtimeId,
	hasSession,
	isStreaming,
	placeholderVisible,
}: InlinePromptSuggestionOptions): InlinePromptSuggestion {
	const store = useStore();
	const suggestions = useAtomValue(promptSuggestionsAtom);
	const dismissed = useAtomValue(promptSuggestionDismissedAtom);
	const list = runtimeId ? suggestions[runtimeId] : undefined;
	const suggestion = runtimeId && list && dismissed[runtimeId] !== list ? list[0] : undefined;
	const visible = Boolean(suggestion) && hasSession && !isStreaming && placeholderVisible;

	const dismiss = useCallback(() => {
		if (!runtimeId || !list) return;
		store.set(promptSuggestionDismissedAtom, (previous) =>
			previous[runtimeId] === list ? previous : { ...previous, [runtimeId]: list },
		);
	}, [list, runtimeId, store]);

	// 输入框一旦有内容（打字、Tab 填入、粘贴…），这一条就算用过了。
	useEffect(() => {
		if (suggestion && !placeholderVisible) dismiss();
	}, [dismiss, placeholderVisible, suggestion]);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent): boolean => {
			if (!visible || !suggestion || event.isComposing) return false;
			if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
			if (event.key === "Tab") {
				event.preventDefault();
				store.set(inputValueAtom, suggestion);
				return true;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				dismiss();
				return true;
			}
			return false;
		},
		[dismiss, store, suggestion, visible],
	);

	return { suggestion, visible, handleKeyDown };
}
