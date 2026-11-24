import { preloadHighlighter } from "@pierre/diffs";
import { useTranslation } from "@vetta-org/plugin-sdk";
import { Button } from "@vetta-org/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findEntry } from "../git/gitStatus";
import { resizePanel } from "../git/runtime";
import type { ChangeRef, ChangeSection, StatusGroups } from "../git/types";
import type { MenuPoint } from "./ChangeMenu";
import { FloatingChangeMenu } from "./ChangeMenu";
import { BranchBar } from "./BranchBar";
import { ChangeSectionList, SECTION_MIN_HEIGHT } from "./ChangeSectionList";
import { CleanState } from "./CleanState";
import { CommitBox } from "./CommitBox";
import { ConfirmDialog } from "./ConfirmDialog";
import { DiffPane } from "./DiffPane";
import { GitActions } from "./GitActions";
import { FileIcon, StageIcon, UnstageIcon } from "./icons";
import { SplitHandle } from "./SplitHandle";
import { useChangeActions } from "./useChangeActions";

// 容器宽于此值时显示右侧 diff 区；窄于此值只显示文件列表（拖窄自动收起 diff）。
// 阈值要留得住「列表 + 一屏能读的 diff」，否则一拉宽就挤出一条读不了的窄 diff。
const DIFF_MIN_WIDTH = 560;
const LIST_DEFAULT_WIDTH = 300;
const LIST_MIN_WIDTH = 180;
// diff 展开时给右侧 diff 保留的最小宽度，限制文件列最大宽度。
const DIFF_RESERVED_WIDTH = 260;

/** Files listed by name in the discard confirmation before it says "and N more". */
const DISCARD_PREVIEW = 5;

/** Render order of the sections: conflicts first, they block committing. */
const SECTION_ORDER: readonly ChangeSection[] = ["conflict", "staged", "unstaged"];

/** Selection is confined to one section at a time (see {@link ChangeSectionList}). */
interface Selection {
	section: ChangeSection;
	paths: readonly string[];
}

/** Ready-state body: sectioned flat change list on the left, width-gated diff pane on the right. */
export function GitChanges({ root, groups, onOpenGraph }: { root: string; groups: StatusGroups; onOpenGraph: () => void }): JSX.Element {
	const { t } = useTranslation();
	const [containerWidth, setContainerWidth] = useState(0);
	const [active, setActive] = useState<ChangeRef | null>(null);
	const [selection, setSelection] = useState<Selection>({ section: "unstaged", paths: [] });
	const [collapsed, setCollapsed] = useState<Record<ChangeSection, boolean>>({
		conflict: false,
		staged: false,
		unstaged: false,
	});
	const [listWidth, setListWidth] = useState(LIST_DEFAULT_WIDTH);
	const actions = useChangeActions(root, groups);

	// 预热 diff 高亮器：共享高亮器是会话级单例，首个 diff 渲染时若主题尚未挂载，
	// 渲染器会跳过同步渲染返回空白，须切换文件才恢复。文件列表出现即提前挂载明暗
	// 两套主题，让首个 diff 直接同步渲染（重复调用因单例守卫而无副作用）。
	useEffect(() => {
		void preloadHighlighter({ themes: ["github-dark-default", "github-light-default"], langs: ["text"] });
	}, []);

	/**
	 * Width probe as a callback ref, not a mount effect.
	 *
	 * The measured element only exists while there are changes, so a `[]` effect
	 * would run once against a null ref when nothing is changed and never retry —
	 * the panel then stayed in its narrow single-column layout no matter how wide
	 * the user dragged it, and the diff pane never appeared.
	 */
	const observerRef = useRef<ResizeObserver | null>(null);
	const measureRef = useCallback((el: HTMLDivElement | null) => {
		observerRef.current?.disconnect();
		observerRef.current = null;
		if (!el) return;
		setContainerWidth(el.getBoundingClientRect().width);
		const observer = new ResizeObserver((items) => {
			for (const item of items) setContainerWidth(item.contentRect.width);
		});
		observer.observe(el);
		observerRef.current = observer;
	}, []);

	useEffect(() => () => observerRef.current?.disconnect(), []);

	const total = groups.conflict.length + groups.staged.length + groups.unstaged.length;
	const wide = containerWidth >= DIFF_MIN_WIDTH;
	const activeEntry = active ? findEntry(groups[active.section], active.path) : null;

	// 拉宽且无有效选择时，默认选中第一个变更文件（仿文件活动面板）。
	// 选中文件被移除（刷新后失效）时也回落到第一个。
	useEffect(() => {
		if (!wide || activeEntry) return;
		for (const section of SECTION_ORDER) {
			const first = groups[section][0];
			if (first) {
				setActive({ section, path: first.path });
				return;
			}
		}
	}, [wide, activeEntry, groups]);

	// 选中变化：只保留一个分区的多选，并把「刚进入选中的那个文件」作为 diff 的对象。
	// 窄屏点文件时把面板拉到最大并打开 diff（仿文件面板）。
	const handleSelection = useCallback(
		(section: ChangeSection, paths: string[], added: string | null) => {
			setSelection({ section, paths });
			if (added) {
				setActive({ section, path: added });
				if (!wide) resizePanel("max");
			}
		},
		[wide],
	);

	/**
	 * 分区间的高度权重。
	 *
	 * 未拖动时按文件数分配（小数区分区不会挤成一条），一旦用户拖动就冻结成权重：
	 * 高度 = 权重 / 总权重 × 可用高度，所以容器变高变矮时比例仍然成立，不会把
	 * 最后一个分区顶出可视区。分区增删（例如提交后暂存区清空）时回到默认比例，
	 * 免得上一次的比例套在完全不同的内容上。
	 */
	const sectionsBodyRef = useRef<HTMLDivElement | null>(null);
	const [weights, setWeights] = useState<Partial<Record<ChangeSection, number>>>({});
	const weightsRef = useRef(weights);
	weightsRef.current = weights;
	// 一次拖拽会话内的换算基准：可用高度与权重总和。
	const dragScaleRef = useRef<{ available: number; total: number } | null>(null);

	const visibleSections = SECTION_ORDER.filter((section) => groups[section].length > 0 && !collapsed[section]);
	const visibleKey = visibleSections.join(",");

	// 可见分区集合变化时回到默认比例。
	useEffect(() => {
		setWeights({});
		weightsRef.current = {};
	}, [visibleKey]);

	const beginSectionResize = useCallback(() => {
		const el = sectionsBodyRef.current;
		if (!el) return;
		const seeded: Partial<Record<ChangeSection, number>> = {};
		let total = 0;
		for (const section of visibleSections) {
			const weight = weightsRef.current[section] ?? groups[section].length;
			seeded[section] = weight;
			total += weight;
		}
		if (total <= 0) return;
		setWeights(seeded);
		weightsRef.current = seeded;
		dragScaleRef.current = { available: el.clientHeight, total };
	}, [visibleSections, groups]);

	const resizeSections = useCallback(
		(above: ChangeSection, below: ChangeSection, deltaY: number) => {
			const scale = dragScaleRef.current;
			if (!scale || scale.available <= 0) return;
			const pxPerWeight = scale.available / scale.total;
			const minWeight = SECTION_MIN_HEIGHT / pxPerWeight;
			const current = weightsRef.current;
			const aboveWeight = current[above] ?? 0;
			const belowWeight = current[below] ?? 0;
			// 两边都不许被拖到小于最小可用高度，超出部分直接丢弃（继续拖不会累积）。
			let dw = deltaY / pxPerWeight;
			dw = Math.min(dw, belowWeight - minWeight);
			dw = Math.max(dw, minWeight - aboveWeight);
			if (dw === 0) return;
			const next = { ...current, [above]: aboveWeight + dw, [below]: belowWeight - dw };
			weightsRef.current = next;
			setWeights(next);
		},
		[],
	);

	const onSplitDrag = useCallback(
		(deltaX: number) => {
			setListWidth((w) => {
				const max = Math.max(LIST_MIN_WIDTH, containerWidth - DIFF_RESERVED_WIDTH);
				return Math.max(LIST_MIN_WIDTH, Math.min(max, w + deltaX));
			});
		},
		[containerWidth],
	);

	const sectionTitles = useMemo<Record<ChangeSection, string>>(
		() => ({
			conflict: t("section.conflict"),
			staged: t("section.staged"),
			unstaged: t("section.unstaged"),
		}),
		[t],
	);

	// 两种视图共用同一个浮层菜单：它 portal 到 body 并做视口夹取，不会被列容器裁掉。
	const renderSectionMenu = useCallback(
		(section: ChangeSection, paths: string[], close: () => void, point?: MenuPoint): JSX.Element => (
			<FloatingChangeMenu x={point?.x ?? 0} y={point?.y ?? 0} target={{ section, paths }} handlers={actions.handlers} onClose={close} />
		),
		[actions.handlers],
	);

	const renderSectionActions = (section: ChangeSection): JSX.Element | null => {
		if (section === "staged") {
			return (
				<Button type="button" variant="ghost" size="icon-xs" title={t("action.unstageAll")} disabled={actions.busy} onClick={actions.unstageAllFiles}>
					<UnstageIcon className="h-3.5 w-3.5" />
				</Button>
			);
		}
		if (section === "unstaged") {
			return (
				<Button type="button" variant="ghost" size="icon-xs" title={t("action.stageAll")} disabled={actions.busy} onClick={actions.stageAllFiles}>
					<StageIcon className="h-3.5 w-3.5" />
				</Button>
			);
		}
		return null;
	};

	const discardCount = actions.pendingDiscard ? actions.pendingDiscard.tracked.length + actions.pendingDiscard.untracked.length : 0;

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex h-9 shrink-0 items-center gap-1 px-2">
				<BranchBar root={root} />
				<div className="ml-auto flex items-center gap-1">
					<GitActions root={root} labelled={wide} />
				</div>
			</div>

			{total === 0 ? (
				<CleanState root={root} onOpenGraph={onOpenGraph} />
			) : (
				<div ref={measureRef} className="flex min-h-0 flex-1 overflow-hidden">
					<div
						className={
							wide
								? "relative flex min-h-0 shrink-0 flex-col overflow-hidden bg-transparent"
								: "flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent"
						}
						style={wide ? { width: listWidth } : undefined}
					>
						<CommitBox root={root} groups={groups} />
						{/* 分区自己吃满剩余高度并各自内部滚动，外层不再整体滚动。 */}
						<div ref={sectionsBodyRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
							{SECTION_ORDER.map((section) => {
								// 只有下面确实还有展开的分区时才给手柄（空分区与折叠分区都不参与分配）。
								const visibleIndex = visibleSections.indexOf(section);
								const resizableBelow = visibleIndex < 0 ? undefined : visibleSections[visibleIndex + 1];
								return (
									<ChangeSectionList
										key={section}
										title={sectionTitles[section]}
										entries={groups[section]}
										collapsed={collapsed[section]}
										onToggleCollapsed={() => setCollapsed((prev) => ({ ...prev, [section]: !prev[section] }))}
										selectedPaths={selection.section === section ? selection.paths : []}
										onSelectionChange={(paths, added) => handleSelection(section, paths, added)}
										renderMenu={(paths, close, point) => renderSectionMenu(section, paths, close, point)}
										actions={renderSectionActions(section)}
										tone={section === "conflict" ? "danger" : undefined}
										weight={weights[section]}
										onResizeStart={beginSectionResize}
										onResize={resizableBelow ? (deltaY) => resizeSections(section, resizableBelow, deltaY) : undefined}
										resizeTitle={resizableBelow ? t("section.resize") : undefined}
									/>
								);
							})}
						</div>
						{wide && <SplitHandle onDrag={onSplitDrag} />}
					</div>
					{wide &&
						(activeEntry && active ? (
							<DiffPane root={root} entry={activeEntry} section={active.section} />
						) : (
							<div className="mb-2 ml-0.5 mr-2 mt-1 flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-border/70 bg-background text-muted-foreground">
								<FileIcon className="h-6 w-6 opacity-50" />
								<span className="text-[12px]">{t("diff.selectPrompt")}</span>
							</div>
						))}
				</div>
			)}

			<ConfirmDialog
				open={actions.pendingDiscard !== null}
				destructive
				title={t("discard.title", { count: discardCount })}
				description={t("discard.description")}
				detail={
					actions.pendingDiscard && (
						<ul className="max-h-32 overflow-y-auto rounded border border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
							{[...actions.pendingDiscard.tracked, ...actions.pendingDiscard.untracked].slice(0, DISCARD_PREVIEW).map((path) => (
								<li key={path} className="truncate">
									{path}
								</li>
							))}
							{discardCount > DISCARD_PREVIEW && <li className="italic">{t("discard.more", { count: discardCount - DISCARD_PREVIEW })}</li>}
						</ul>
					)
				}
				confirmLabel={t("discard.confirm")}
				onConfirm={actions.confirmDiscard}
				onCancel={actions.cancelDiscard}
			/>
		</div>
	);
}
