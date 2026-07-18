import { useThemeComponent } from "@vetta/theme-sdk";
import { DefaultGuidingWords } from "./GuidingWordsView";
import type { GuidingGroup } from "./types";
import { useGuidingWordsModel } from "./useGuidingWordsModel";

interface GuidingWordsProps {
	groups: GuidingGroup[];
	mounted: boolean;
	onPick: (word: string) => void;
}

// 引导词分组区：按插件分组，组标题=插件 name。展示限额靠轮播实现（非数据截断）：
// 组数 >2 时组级 8s 滑动窗口步进 1 轮转（每个插件都会进入可见区）；
// 某组词数 >3 时该组词级 6s 轮播切页；未超出则静态。
// 每组最多展示 3 词；视图层固定 3 槽位高度 + 单行 truncate，避免长短词/轮播改高导致页面抖动。
// 全文通过 button title 暴露，悬停可看完整内容。
export function GuidingWords({ groups, mounted, onPick }: GuidingWordsProps): JSX.Element {
	const viewGroups = useGuidingWordsModel(groups);
	const ThemedGuidingWords = useThemeComponent("chat.newSessionGuidingWords", DefaultGuidingWords);

	return <ThemedGuidingWords groups={viewGroups} mounted={mounted} onPick={onPick} />;
}
