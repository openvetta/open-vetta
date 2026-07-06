import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { usePluginI18n } from "../../../plugins/runtime/plugin-i18n";
import {
	easeOut,
	GUIDING_GROUP_INTERVAL,
	GUIDING_GROUP_PAGE,
	GUIDING_WORD_INTERVAL,
	GUIDING_WORD_PAGE,
	guidingEase,
} from "./constants";
import type { GuidingGroup } from "./types";

interface GuidingWordsProps {
	groups: GuidingGroup[];
	mounted: boolean;
	onPick: (word: string) => void;
}

// 引导词分组区：按插件分组，组标题=插件 name。展示限额靠轮播实现（非数据截断）：
// 组数 >2 时组级 24s 轮播切批；某组词数 >3 时该组词级 6s 轮播切页；未超出则静态。
// 每组恒显示 min(词数, 3) 行（超出轮播、绝不撑高列）；单个词过长则换行完整展示，不省略。
export function GuidingWords({ groups, mounted, onPick }: GuidingWordsProps): JSX.Element {
	const [groupTick, setGroupTick] = useState(0);
	const [wordTick, setWordTick] = useState(0);
	const tr = usePluginI18n();
	const needGroupRotate = groups.length > GUIDING_GROUP_PAGE;
	const needWordRotate = groups.some((g) => g.words.length > GUIDING_WORD_PAGE);

	useEffect(() => {
		if (!needGroupRotate) return;
		const id = window.setInterval(() => setGroupTick((t) => t + 1), GUIDING_GROUP_INTERVAL);
		return () => window.clearInterval(id);
	}, [needGroupRotate]);

	useEffect(() => {
		if (!needWordRotate) return;
		const id = window.setInterval(() => setWordTick((t) => t + 1), GUIDING_WORD_INTERVAL);
		return () => window.clearInterval(id);
	}, [needWordRotate]);

	const groupPages = Math.max(1, Math.ceil(groups.length / GUIDING_GROUP_PAGE));
	const gp = groupTick % groupPages;
	const visibleGroups = groups.slice(gp * GUIDING_GROUP_PAGE, gp * GUIDING_GROUP_PAGE + GUIDING_GROUP_PAGE);

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 8 }}
			transition={{ duration: 0.5, delay: 0.35, ease: easeOut }}
			// 跟随外层左对齐列（max-w-2xl）；单组占左半、双组左右等分，整体左对齐。
			className="mt-5 grid w-full grid-cols-2 items-start gap-x-10"
		>
			{visibleGroups.map((group) => {
				const wordPages = Math.max(1, Math.ceil(group.words.length / GUIDING_WORD_PAGE));
				const wp = wordTick % wordPages;
				// 滑动窗口分页：每屏恒为 slotCount 条（满屏），末屏起点对齐到末尾，
				// 不足整屏时从上一屏借词补全（如 5 词 max 4：第二屏 [1..4] 借 3 个，而非只剩 [4]）。
				const slotCount = Math.min(group.words.length, GUIDING_WORD_PAGE);
				const start = Math.min(wp * GUIDING_WORD_PAGE, group.words.length - slotCount);
				const pageWords = group.words.slice(start, start + slotCount);
				const padRows = slotCount - pageWords.length;
				const groupName = tr(group, group.name);
				return (
					<div key={group.id} className="flex w-full min-w-0 flex-col gap-1.5">
						<div className="truncate px-0.5 text-[12px] font-semibold text-foreground/80" title={groupName}>
							{groupName}
						</div>
						{/* 不用 AnimatePresence mode="wait"：那会先卸载旧页留一帧空容器导致塌高。
						    slotCount 恒定 + key 切换让 React 同一次提交内替换，无空帧。
						    pl-2.5 让整条树状引导线相对顶部 name 缩进；切页时子项逐行级联淡入，灵动丝滑。 */}
						<motion.div
							key={wp}
							initial="initial"
							animate="animate"
							variants={{ animate: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } } }}
							className="flex flex-col pl-2.5"
						>
							{pageWords.map((word, idx) => {
								// 树状引导线：竖脊 + 每行横向支线；最后一行竖脊收口为圆角拐弯（elbow）。
								const isLast = idx === pageWords.length - 1;
								const wordText = tr(group, word);
								return (
									<motion.button
										key={`${wp}-${idx}-${word}`}
										type="button"
										onClick={() => onPick(wordText)}
										variants={{
											initial: { opacity: 0, x: -6 },
											animate: { opacity: 1, x: 0 },
										}}
										transition={{ duration: 0.55, ease: guidingEase }}
										whileTap={{ scale: 0.98 }}
										title={wordText}
										className={`relative flex min-h-8 items-start py-1.5 pl-[18px] text-left text-[12px] leading-relaxed text-muted-foreground transition-colors hover:text-primary before:absolute before:left-0 before:border-l before:border-muted-foreground/30 before:content-[''] ${
											isLast
												? "before:top-0 before:h-4 before:w-[12px] before:rounded-bl-[7px] before:border-b"
												: "before:inset-y-0 before:w-0 after:absolute after:left-0 after:top-4 after:w-[12px] after:border-t after:border-muted-foreground/30 after:content-['']"
										}`}
									>
										<span className="break-words">{wordText}</span>
									</motion.button>
								);
							})}
							{Array.from({ length: padRows }, (_, i) => (
								<div key={`${wp}-ph-${i}`} aria-hidden className="h-8" />
							))}
						</motion.div>
					</div>
				);
			})}
		</motion.div>
	);
}
