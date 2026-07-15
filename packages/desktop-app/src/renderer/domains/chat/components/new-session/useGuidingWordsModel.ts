import type { NewSessionGuidingWordsGroup } from "@vetta/theme-ui";
import { useEffect, useState } from "react";
import { usePluginI18n } from "../../../plugins/runtime/plugin-i18n";
import { GUIDING_GROUP_INTERVAL, GUIDING_GROUP_PAGE, GUIDING_WORD_INTERVAL, GUIDING_WORD_PAGE } from "./constants";
import type { GuidingGroup } from "./types";

/**
 * 组级轮播：步进 1 的滑动窗口（wrap），保证每个插件组都会进入可见区。
 * 旧实现按 pageSize 整页跳切（0-1 → 2-3），组数略多时末批长期轮不到；
 * 且 24s 间隔远长于词级 6s，体感上「永远只有头两个插件在转」。
 */
function pickVisibleGroups(groups: readonly GuidingGroup[], tick: number): GuidingGroup[] {
	if (groups.length === 0) return [];
	if (groups.length <= GUIDING_GROUP_PAGE) {
		return groups.slice();
	}
	const offset = ((tick % groups.length) + groups.length) % groups.length;
	const visible: GuidingGroup[] = [];
	for (let i = 0; i < GUIDING_GROUP_PAGE; i++) {
		const group = groups[(offset + i) % groups.length];
		if (group) visible.push(group);
	}
	return visible;
}

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

	const groupOffset = needGroupRotate ? groupTick % groups.length : 0;
	const visibleGroups = pickVisibleGroups(groups, groupTick);

	return visibleGroups.map((group, columnIndex) => {
		const wordPages = Math.max(1, Math.ceil(group.words.length / GUIDING_WORD_PAGE));
		const wordPage = wordTick % wordPages;
		const slotCount = Math.min(group.words.length, GUIDING_WORD_PAGE);
		// 滑动窗口分页：每屏恒为 slotCount 条；末屏起点对齐到末尾，不足时从上一屏借词补全。
		const start = Math.min(wordPage * GUIDING_WORD_PAGE, group.words.length - slotCount);

		return {
			// 同一插件可能在滑动窗口中换列；id 带列位避免 React 只按 id 挪 DOM 导致动画/布局错位。
			id: `${group.id}@${columnIndex}`,
			name: tr(group, group.name),
			// 组位移 + 词页一并写入，组切与词切都能触发级联入场。
			pageKey: groupOffset * 1000 + wordPage,
			words: group.words.slice(start, start + slotCount).map((word) => tr(group, word)),
		};
	});
}
