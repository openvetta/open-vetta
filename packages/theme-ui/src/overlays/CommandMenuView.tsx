import { ButtonGroup, ButtonGroupItem } from "@vetta-org/ui/button-group";
import { useCallback, useEffect, useRef, type JSX, type RefObject } from "react";
import { detectKbdPlatform, resolveKbdKeys } from "../shared/kbd-keys";
import { VettaKbd } from "../shared/VettaKbd";
import { CommandMenuRow } from "./CommandMenuRow";
import type { CommandMenuGroupView, CommandMenuViewLabels } from "./command-menu-types";
import { SplashInputHeader } from "./SplashParts";
import { SplashPanel } from "./SplashPanel";
import "./command-menu.css";

/**
 * 全局 Command Menu 的纯展示层：无状态、无数据获取，键盘导航由宿主的快捷键
 * scope 驱动（见 desktop `shared/shortcuts`），本组件只负责渲染与滚动跟随。
 *
 * 面板顶部对齐而非垂直居中：结果条数会变，垂直居中会让输入框随每次击键上下跳。
 */

/**
 * 浮在列表上的按钮组在浅色下补一层玻璃：通用 ButtonGroup 的浅色只有一层淡灰底（贴在普通页面上够用），
 * 压在白色玻璃面板和列表内容上就成了一块灰片。这里只覆盖浅色的底色与阴影（深色沿用 ButtonGroup
 * 自带的 dark: 样式不变），不改通用组件。
 */
export const COMMAND_MENU_FLOATING_GROUP_CLASS =
	"pointer-events-auto bg-white/65 shadow-[inset_0_1px_0_rgb(255_255_255/0.95),0_0_0_1px_rgb(0_0_0/0.07),0_6px_18px_-6px_rgb(0_0_0/0.18)]";

/** 悬停提示里的快捷键文字，例如 mac 上的「⌘N」、Windows 上的「Ctrl N」。 */
function formatKbdTitle(keys: string): string {
	const platform = detectKbdPlatform();
	return resolveKbdKeys(keys, platform).join(platform === "mac" ? "" : " ");
}

export interface CommandMenuViewProps {
	readonly open: boolean;
	readonly query: string;
	readonly groups: readonly CommandMenuGroupView[];
	readonly selectedId: string | null;
	readonly labels: CommandMenuViewLabels;
	/** 唤起 / 关闭面板的快捷键（例如 "mod+t"），显示在输入框右侧。 */
	readonly toggleShortcut?: string;
	/** 给了就在左下角显示「新会话」按钮，与右下角操作按钮组对称。 */
	readonly onNewSession?: () => void;
	/** 新建会话的生效快捷键，显示在按钮里。 */
	readonly newSessionShortcut?: string;
	/** 结果集因击键刚变化：抑制选中指示条的位移动画。 */
	readonly suppressSelectionAnimation: boolean;
	readonly inputRef?: RefObject<HTMLInputElement | null>;
	readonly onQueryChange: (value: string) => void;
	readonly onHoverItem: (id: string) => void;
	readonly onActivateItem: (id: string) => void;
	readonly onClose: () => void;
}

export function CommandMenuView({
	open,
	query,
	groups,
	selectedId,
	labels,
	toggleShortcut,
	onNewSession,
	newSessionShortcut,
	suppressSelectionAnimation,
	inputRef,
	onQueryChange,
	onHoverItem,
	onActivateItem,
	onClose,
}: CommandMenuViewProps): JSX.Element {
	const rowRefs = useRef(new Map<string, HTMLButtonElement>());

	const registerRef = useCallback((id: string, element: HTMLButtonElement | null) => {
		if (element) rowRefs.current.set(id, element);
		else rowRefs.current.delete(id);
	}, []);

	// 鼠标悬停也会改选中项，但指针指着的行本来就在眼前，此时滚动只会让列表从指针下溜走。
	const selectedByPointerRef = useRef(false);
	const handleHoverItem = useCallback(
		(id: string) => {
			// mousemove 会在同一行上反复触发；选中项没变就不会有滚动副作用，别留下标记吞掉下一次键盘跟随。
			if (id !== selectedId) selectedByPointerRef.current = true;
			onHoverItem(id);
		},
		[onHoverItem, selectedId],
	);

	// 键盘选中项滚动跟随。用 "nearest" 且不带 smooth：连续按方向键时平滑滚动会排队堆积。
	// 留白靠列表的 scroll-padding（见下方 className）：底部要越过渐隐区和浮动按钮组再多留一行，
	// 选中行才不会沉到按钮后面，往下按时也总能看到下一行是什么；顶部同样多留一行。
	// 不用 "center"：那样每按一下整张列表都要挪动，眼睛跟不住。
	// 可选链到方法本身：jsdom 与部分老 webview 没有实现 scrollIntoView，不能让它把渲染打断。
	useEffect(() => {
		if (!open || !selectedId) return;
		if (selectedByPointerRef.current) {
			selectedByPointerRef.current = false;
			return;
		}
		rowRefs.current.get(selectedId)?.scrollIntoView?.({ block: "nearest" });
	}, [open, selectedId]);

	const hasResults = groups.some((group) => group.items.length > 0);
	const anyLoading = groups.some((group) => group.loading);

	return (
		<SplashPanel
			open={open}
			onClose={onClose}
			label={labels.title}
			header={
				<SplashInputHeader
					icon="icon-[solar--magnifer-linear]"
					inputRef={inputRef}
					label={labels.title}
					value={query}
					placeholder={labels.placeholder}
					onChange={onQueryChange}
					// 打开后的聚焦由宿主在 open 变化时负责（见 desktop CommandMenu）。
					autoFocus={false}
					trailing={toggleShortcut ? <VettaKbd keys={toggleShortcut} size="sm" variant="flat" /> : undefined}
					inputProps={{
						role: "combobox",
						"aria-expanded": hasResults,
						"aria-controls": "command-menu-list",
						"aria-activedescendant": selectedId ? `command-menu-item-${selectedId}` : undefined,
					}}
				/>
			}
		>
			<div className="relative flex min-h-0 flex-col">
			<div
				id="command-menu-list"
				role="listbox"
				aria-label={labels.title}
				// 底部留出浮动按钮组的高度，最后一行滚到底时不会被它盖住；同一段高度做渐隐，
				// 滚动中的内容在按钮后面淡出，而不是被按钮生硬地截断。
				className="min-h-0 max-h-[min(460px,60vh)] overflow-y-auto overscroll-contain px-1.5 pt-1.5 pb-14 scroll-pt-10 scroll-pb-24 [mask-image:linear-gradient(to_bottom,black_calc(100%-56px),transparent)]"
			>
			{groups.map((group) => {
				if (group.items.length === 0 && !group.loading) return null;
				return (
					<div key={group.key} role="group" aria-label={group.label} className="mb-1 last:mb-0">
						<div className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-muted-foreground/70">
							{group.label}
						</div>
						{group.items.map((item) => (
							<CommandMenuRow
								key={item.id}
								item={item}
								active={item.id === selectedId}
								suppressSelectionAnimation={suppressSelectionAnimation}
								onActivate={onActivateItem}
								onHover={handleHoverItem}
								registerRef={registerRef}
							/>
						))}
						{group.loading && (
							<div
								aria-label={labels.loading}
								className="flex h-9 items-center gap-2.5 px-2.5"
							>
								{/* 固定高度骨架：异步结果到达时不产生高度跳变。 */}
								<span className="size-4 shrink-0 animate-pulse rounded bg-muted" />
								<span className="h-3 w-40 animate-pulse rounded bg-muted" />
							</div>
						)}
						{group.overflowLabel && (
							<div className="px-2.5 pb-1 pt-0.5 text-[11px] text-muted-foreground/60">
								{group.overflowLabel}
							</div>
						)}
					</div>
				);
			})}

			{!hasResults && !anyLoading && (
				<div className="flex flex-col items-center gap-1 px-3 py-10 text-center">
					<span className="text-[13px] text-foreground">{labels.empty}</span>
					<span className="text-[11px] text-muted-foreground">{labels.emptyHint}</span>
				</div>
			)}
			</div>
			{/*
			 * 操作提示做成浮在列表底部的两组按钮（复用通用 ButtonGroup 的玻璃胶囊），既是提示也能点：
			 * 左边「新会话」（只有图标），右边「打开」作用于当前选中项、「关闭」等同 esc；左右对称。
			 * 上下选择只靠方向键，不占一个按钮。外层不接收指针，按钮之间的空隙仍能滚动 / 点到列表。
			 */}
			<div className="pointer-events-none absolute inset-x-2.5 bottom-2.5 z-10 flex items-center justify-between gap-2">
				{onNewSession ? (
					// 只有图标的圆形按钮：胶囊里单个纯图标项正好是一颗与右侧按钮组等高的圆。
					<ButtonGroup className={COMMAND_MENU_FLOATING_GROUP_CLASS}>
						<ButtonGroupItem
							onClick={onNewSession}
							aria-label={labels.newSession}
							title={newSessionShortcut ? `${labels.newSession} (${formatKbdTitle(newSessionShortcut)})` : labels.newSession}
							icon={<span aria-hidden="true" className="icon-[solar--pen-new-square-linear] size-4" />}
						/>
					</ButtonGroup>
				) : (
					<span />
				)}
				<ButtonGroup className={COMMAND_MENU_FLOATING_GROUP_CLASS} aria-label={labels.actionsLabel}>
					<ButtonGroupItem
						disabled={!selectedId}
						onClick={() => {
							if (selectedId) onActivateItem(selectedId);
						}}
						label={
							<span className="inline-flex items-center gap-2">
								{labels.hintSelect}
								<VettaKbd keys="enter" size="sm" variant="flat" />
							</span>
						}
					/>
					<ButtonGroupItem
						onClick={onClose}
						label={
							<span className="inline-flex items-center gap-2">
								{labels.hintClose}
								<VettaKbd keys="esc" size="sm" variant="flat" />
							</span>
						}
					/>
				</ButtonGroup>
			</div>
			</div>
		</SplashPanel>
	);
}
