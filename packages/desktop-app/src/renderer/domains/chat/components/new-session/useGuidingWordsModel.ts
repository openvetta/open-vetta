import type { NewSessionGuidingWordsGroup } from "@vetta/theme-ui";
import { useEffect, useState } from "react";
import { usePluginI18n } from "../../../plugins/runtime/plugin-i18n";
import { GUIDING_GROUP_INTERVAL, GUIDING_GROUP_PAGE, GUIDING_WORD_INTERVAL, GUIDING_WORD_PAGE } from "./constants";
import type { GuidingGroup } from "./types";

export function useGuidingWordsModel(groups: readonly GuidingGroup[]): readonly NewSessionGuidingWordsGroup[] {
	const [groupTick, setGroupTick] = useState(0);
	const [wordTick, setWordTick] = useState(0);
	const tr = usePluginI18n();
	const needGroupRotate = groups.length > GUIDING_GROUP_PAGE;
	const needWordRotate = groups.some((group) => group.words.length > GUIDING_WORD_PAGE);

	useEffect(() => {
		if (!needGroupRotate) return;
		const id = window.setInterval(() => setGroupTick((tick) => tick + 1), GUIDING_GROUP_INTERVAL);
		return () => window.clearInterval(id);
	}, [needGroupRotate]);

	useEffect(() => {
		if (!needWordRotate) return;
		const id = window.setInterval(() => setWordTick((tick) => tick + 1), GUIDING_WORD_INTERVAL);
		return () => window.clearInterval(id);
	}, [needWordRotate]);

	const groupPages = Math.max(1, Math.ceil(groups.length / GUIDING_GROUP_PAGE));
	const groupPage = groupTick % groupPages;
	const visibleGroups = groups.slice(
		groupPage * GUIDING_GROUP_PAGE,
		groupPage * GUIDING_GROUP_PAGE + GUIDING_GROUP_PAGE,
	);

	return visibleGroups.map((group) => {
		const wordPages = Math.max(1, Math.ceil(group.words.length / GUIDING_WORD_PAGE));
		const wordPage = wordTick % wordPages;
		const slotCount = Math.min(group.words.length, GUIDING_WORD_PAGE);
		const start = Math.min(wordPage * GUIDING_WORD_PAGE, group.words.length - slotCount);

		return {
			id: group.id,
			name: tr(group, group.name),
			pageKey: wordPage,
			words: group.words.slice(start, start + slotCount).map((word) => tr(group, word)),
		};
	});
}
