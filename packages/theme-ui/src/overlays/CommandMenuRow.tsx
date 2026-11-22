import { motion } from "motion/react";
import { memo, type JSX } from "react";
import { cn } from "@vetta-org/ui/utils";
import { ConversationTagDotsView } from "../project/ConversationTagDotsView";
import { SessionStatusIcon } from "../sidebar/SessionStatusIcon";
import type { CommandMenuHighlightRange, CommandMenuItemView } from "./command-menu-types";

/**
 * 结果行。选中态是一块与 ButtonGroup 选中项同语言的玻璃圆角底（前景色低透明度叠层 + 上沿亮线），
 * 只在用户上下移动选中项时让这块底滑过去；结果重算时直接落位，不逐击键播放。
 */

/** 把命中区间渲染成高亮片段；区间由调用方保证已排序且互不重叠。 */
function Highlighted({
	text,
	ranges,
}: {
	text: string;
	ranges: readonly CommandMenuHighlightRange[];
}): JSX.Element {
	if (ranges.length === 0) return <>{text}</>;
	const nodes: JSX.Element[] = [];
	let cursor = 0;
	for (const [index, range] of ranges.entries()) {
		if (range.start > cursor) {
			nodes.push(<span key={`plain-${index}`}>{text.slice(cursor, range.start)}</span>);
		}
		nodes.push(
			<span key={`hit-${index}`} className="text-primary">
				{text.slice(range.start, range.end)}
			</span>,
		);
		cursor = range.end;
	}
	if (cursor < text.length) nodes.push(<span key="plain-tail">{text.slice(cursor)}</span>);
	return <>{nodes}</>;
}

export interface CommandMenuRowProps {
	readonly item: CommandMenuItemView;
	readonly active: boolean;
	/** 结果集刚变化时抑制指示条的位移动画，避免逐击键抖动。 */
	readonly suppressSelectionAnimation: boolean;
	readonly onActivate: (id: string) => void;
	readonly onHover: (id: string) => void;
	/** 给了就在悬停 / 选中时于行尾显示「更多」按钮，给不爱用键盘的人。 */
	readonly onMore?: (id: string) => void;
	readonly moreLabel?: string;
	readonly registerRef: (id: string, element: HTMLButtonElement | null) => void;
}

export const CommandMenuRow = memo(function CommandMenuRow({
	item,
	active,
	suppressSelectionAnimation,
	onActivate,
	onHover,
	onMore,
	moreLabel,
	registerRef,
}: CommandMenuRowProps): JSX.Element {
	const disabled = Boolean(item.disabled);
	return (
		<button
			type="button"
			ref={(element) => registerRef(item.id, element)}
			role="option"
			id={`command-menu-item-${item.id}`}
			aria-selected={active}
			aria-disabled={disabled || undefined}
			title={disabled ? item.disabledReason : undefined}
			disabled={disabled}
			onMouseMove={() => {
				if (!disabled) onHover(item.id);
			}}
			onClick={() => {
				if (!disabled) onActivate(item.id);
			}}
			className={cn(
				"group relative flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left outline-none transition-colors",
				disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
			)}
		>
			{active && (
				<motion.span
					aria-hidden="true"
					layoutId="command-menu-active-marker"
					// 结果重算时 layout 动画会把指示条从旧行“弹”到新行，逐击键播放既抖又费；
					// 只有用户主动上下移动选中项时才让它滑动。
					layout={!suppressSelectionAnimation}
					transition={
						suppressSelectionAnimation
							? { duration: 0 }
							: { type: "spring", stiffness: 500, damping: 32 }
					}
					className="absolute inset-0 rounded-lg bg-foreground/[0.06] dark:bg-white/[0.08] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]"
				/>
			)}
			{item.status === "unread" ? (
				// 跑完未看：保留会话图标，右上角叠一颗强调色圆点，和「在转 / 问号」区分开。
				<span aria-hidden="true" data-session-unread="true" className="relative flex size-4 shrink-0 items-center justify-center">
					<span className={cn(item.icon, "size-4", active ? "text-foreground" : "text-muted-foreground")} />
					<span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-primary" />
				</span>
			) : item.status ? (
				<span aria-hidden="true" className="relative flex size-4 shrink-0 items-center justify-center">
					<SessionStatusIcon
						active={active}
						running={item.status === "running"}
						waiting={item.status === "waiting"}
						scheduled={false}
					/>
				</span>
			) : item.tagColors && item.tagColors.length > 0 ? (
				// 与侧栏会话一致：标签色点占据行首图标的位置，多个标签就画多个。
				<ConversationTagDotsView colors={item.tagColors} className="relative size-4" />
			) : (
				<span
					aria-hidden="true"
					className={cn(item.icon, "relative size-4 shrink-0", active ? "text-foreground" : "text-muted-foreground")}
				/>
			)}
			<span className="relative flex min-w-0 flex-1 items-baseline gap-2">
				{/*
				 * 标题不参与收缩（shrink-0），只受 max-w 约束：标题和副标题都可收缩时，
				 * flex 会按内容等比压缩，一条长描述能把名字挤成两三个字。让副标题先让位。
				 */}
				<span className="max-w-[60%] shrink-0 truncate text-[13px] text-foreground">
					<Highlighted text={item.title} ranges={item.titleHighlights} />
				</span>
				{item.subtitle && (
					<span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
						<Highlighted text={item.subtitle} ranges={item.subtitleHighlights ?? []} />
					</span>
				)}
			</span>
			{item.status && item.statusLabel && (
				<span
					className={cn(
						"relative shrink-0 text-[11px]",
						item.status === "waiting" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
					)}
				>
					{item.statusLabel}
				</span>
			)}
			{item.badge && (
				<span
					className={cn(
						"relative max-w-[40%] shrink-0 truncate rounded-[5px] px-1.5 py-px text-[10px] font-medium leading-4",
						item.badgeTone === "accent"
							? "bg-primary/15 text-primary"
							: "bg-foreground/[0.06] text-muted-foreground dark:bg-white/[0.08]",
					)}
				>
					{item.badge}
				</span>
			)}
			{onMore && (
				<span
					role="button"
					tabIndex={-1}
					aria-label={moreLabel}
					title={moreLabel}
					onClick={(event) => {
						event.stopPropagation();
						onMore(item.id);
					}}
					className={cn(
						"relative -mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground",
						active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
					)}
				>
					<span aria-hidden="true" className="icon-[solar--menu-dots-bold] size-4" />
				</span>
			)}
		</button>
	);
});
