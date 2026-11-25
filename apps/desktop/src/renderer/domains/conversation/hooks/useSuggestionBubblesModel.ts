import { activeSessionAtom, promptSuggestionsAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export interface SuggestionBubblesModel {
	suggestions: string[];
	sendTooltip: string;
}

export function useSuggestionBubblesModel(): SuggestionBubblesModel {
	const { t } = useTranslation("chat");
	const activeSession = useAtomValue(activeSessionAtom);
	const suggestionsMap = useAtomValue(promptSuggestionsAtom);
	const suggestions = useMemo(() => {
		const list = activeSession?.runtimeId ? suggestionsMap[activeSession.runtimeId] : undefined;
		// 第一条显示在输入框里（Tab 填入），气泡只放其余几条，免得重复。
		return list?.slice(1) ?? [];
	}, [activeSession?.runtimeId, suggestionsMap]);

	return {
		suggestions,
		sendTooltip: t("suggestionBubbles.sendTooltip"),
	};
}
