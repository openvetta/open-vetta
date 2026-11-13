import { type ComponentProps, type DragEvent, Fragment, type JSX, type ReactNode, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@vetta-org/ui";
import { ButtonGroup } from "@vetta-org/ui/button-group";
import { SessionTopItem, type SessionTopMenuItem } from "@vetta-org/ui/session-top-item";
import { cn } from "@vetta-org/ui/utils";

/**
 * 会话页顶栏右侧的「统一按钮组」：内置按钮与插件动作按同一套数据渲染，外观完全由宿主决定。
 *
 * 顶栏只显示 `top`；`tray` 里的收进托盘（悬浮在按钮组上时，组下方出现的小白条，点开即是）。
 * 托盘打开期间进入「编辑」状态：
 * - 托盘里只放没上栏的图标（无文字，名称在悬浮提示里），点一下直接使用；
 * - 把托盘里的图标拖进按钮组就上栏，把按钮组里的按钮拖进托盘就收纳，组内也能拖动换序；
 * - 按钮组里还没被占用的席位用虚线方框表示（总数由 `maxTop` 决定）；
 * - 每个图标左上角有 + / − 角标按钮，是不方便拖动时的备选。
 * 本组件只管渲染与交互，布局怎么算、怎么存都在调用方。
 */

export interface HeaderActionPopoverApi {
	readonly close: () => void;
}

export type HeaderActionBehavior =
	| { readonly type: "click"; readonly onClick: () => void }
	| { readonly type: "menu"; readonly items: readonly SessionTopMenuItem[] }
	| { readonly type: "popover"; readonly render: (api: HeaderActionPopoverApi) => ReactNode };

export interface HeaderActionBarItem {
	/** 全局唯一：内置为 `builtin:<name>`，插件为 `<pluginId>:<actionId>`。 */
	readonly key: string;
	readonly title: string;
	readonly icon: ReactNode;
	readonly badge?: number | true;
	readonly active?: boolean;
	readonly disabled?: boolean;
	readonly behavior: HeaderActionBehavior;
}

export type HeaderActionZone = "top" | "tray";

export interface HeaderActionBarLabels {
	/** 小白条的无障碍名称（兼悬浮提示）。 */
	readonly customize: string;
	/** 「放到顶栏」角标按钮的提示。 */
	readonly moveToTop: string;
	/** 顶栏已满时「放到顶栏」按钮的提示。 */
	readonly topFull: string;
	/** 「收纳」角标按钮的提示。 */
	readonly moveToTray: string;
}

export interface HeaderActionBarViewProps {
	readonly top: readonly HeaderActionBarItem[];
	readonly tray: readonly HeaderActionBarItem[];
	/** 固定在组最右、不参与排序与收纳的那一格（活动面板开关）。 */
	readonly pinned?: ReactNode;
	readonly maxTop: number;
	readonly labels: HeaderActionBarLabels;
	/** `index` 是目标区里的插入位置（拖动时按「拖动前」的列表计，由调用方负责修正同区移动）。 */
	readonly onMove: (key: string, zone: HeaderActionZone, index: number) => void;
}

/** 图标统一放进固定方框：插件传来的图标大小各异，不能撑开按钮，也不接收指针事件。 */
function IconBox({ children }: { readonly children: ReactNode }): JSX.Element {
	return (
		<span className="pointer-events-none flex size-4 shrink-0 items-center justify-center overflow-hidden text-[14px] [&>*]:max-h-4 [&>*]:max-w-4">
			{children}
		</span>
	);
}

function BarItem({
	item,
	dragProps,
	className,
}: {
	readonly item: HeaderActionBarItem;
	readonly dragProps?: Pick<ComponentProps<"button">, "draggable" | "onDragStart" | "onDragEnd" | "onDragOver" | "onDrop">;
	readonly className?: string;
}): JSX.Element {
	const common = {
		title: item.title,
		"aria-label": item.title,
		icon: <IconBox>{item.icon}</IconBox>,
		badge: item.badge,
		active: item.active,
		disabled: item.disabled,
		className,
		...dragProps,
	};
	const { behavior } = item;
	if (behavior.type === "menu") return <SessionTopItem {...common} menuItems={behavior.items} />;
	if (behavior.type === "popover") {
		return <SessionTopItem {...common} popoverContent={(api) => behavior.render(api)} />;
	}
	return <SessionTopItem {...common} onClick={behavior.onClick} />;
}

interface DropTarget {
	readonly zone: HeaderActionZone;
	readonly index: number;
}

function TileBadge({ badge }: { readonly badge: HeaderActionBarItem["badge"] }): JSX.Element | null {
	if (badge === undefined) return null;
	if (badge === true) return <span className="absolute top-1 right-1 size-1.5 rounded-full bg-red-500" />;
	return (
		<span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] leading-none font-semibold text-white tabular-nums">
			{badge > 99 ? "99+" : badge}
		</span>
	);
}

/** 方块本体：只有图标，名称靠悬浮提示。点一下就使用。 */
function TileFace({ item, onClick }: { readonly item: HeaderActionBarItem; readonly onClick: () => void }): JSX.Element {
	return (
		<button
			type="button"
			title={item.title}
			aria-label={item.title}
			disabled={item.disabled}
			onClick={onClick}
			className="relative flex h-7 w-8 items-center justify-center rounded-full text-foreground outline-none transition-colors hover:bg-foreground/[0.07] focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-40"
		>
			<IconBox>{item.icon}</IconBox>
			<TileBadge badge={item.badge} />
		</button>
	);
}

function Tile({
	item,
	index,
	count,
	drop,
	dragging,
	moveDisabled,
	moveLabel,
	onMoveClick,
	onDragStart,
	onDragEnd,
	onDragOverTile,
	onClose,
}: {
	readonly item: HeaderActionBarItem;
	readonly index: number;
	readonly count: number;
	readonly drop: DropTarget | null;
	readonly dragging: boolean;
	readonly moveDisabled: boolean;
	readonly moveLabel: string;
	readonly onMoveClick: () => void;
	readonly onDragStart: (event: DragEvent) => void;
	readonly onDragEnd: () => void;
	readonly onDragOverTile: (event: DragEvent, index: number) => void;
	readonly onClose: () => void;
}): JSX.Element {
	const showBefore = drop?.zone === "tray" && drop.index === index;
	const showAfter = drop?.zone === "tray" && drop.index === count && index === count - 1;
	const { behavior } = item;

	let face: ReactNode;
	if (behavior.type === "menu") {
		face = (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<TileFaceTrigger item={item} />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="center" sideOffset={6} className="min-w-40">
					{behavior.items.map((entry) => (
						<Fragment key={entry.id}>
							{entry.separatorBefore ? <DropdownMenuSeparator /> : null}
							<DropdownMenuItem
								disabled={entry.disabled}
								onSelect={() => {
									entry.onSelect();
									onClose();
								}}
								className={entry.destructive ? "text-destructive focus:text-destructive" : undefined}
							>
								{entry.icon ? <IconBox>{entry.icon}</IconBox> : null}
								{entry.label}
							</DropdownMenuItem>
						</Fragment>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		);
	} else if (behavior.type === "popover") {
		face = (
			<Popover>
				<PopoverTrigger asChild>
					<TileFaceTrigger item={item} />
				</PopoverTrigger>
				<PopoverContent
					align="center"
					sideOffset={6}
					className="w-max max-h-[min(70vh,32rem)] max-w-[min(92vw,32rem)] overflow-auto"
				>
					{behavior.render({ close: onClose })}
				</PopoverContent>
			</Popover>
		);
	} else {
		face = (
			<TileFace
				item={item}
				onClick={() => {
					behavior.onClick();
					onClose();
				}}
			/>
		);
	}

	return (
		<li
			draggable
			title={item.title}
			data-header-action-tile={item.key}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			onDragOver={(event) => onDragOverTile(event, index)}
			className={cn(
				"group/tile relative",
				dragging && "opacity-40",
				showBefore && "before:absolute before:-left-1 before:inset-y-1 before:w-0.5 before:rounded-full before:bg-primary",
				showAfter && "after:absolute after:-right-1 after:inset-y-1 after:w-0.5 after:rounded-full after:bg-primary",
			)}
		>
			{face}
			{/* 左上角「+」：放上顶栏，拖不动时的备选（也供键盘使用）。 */}
			<button
				type="button"
				title={moveLabel}
				aria-label={`${moveLabel}: ${item.title}`}
				disabled={moveDisabled}
				onClick={onMoveClick}
				className="absolute -top-1.5 -left-1.5 flex size-3.5 items-center justify-center rounded-full bg-foreground/80 text-background opacity-0 outline-none transition-opacity group-hover/tile:opacity-100 focus-visible:opacity-100 disabled:hidden"
			>
				<span className="icon-[solar--add-linear] size-2.5" />
			</button>
		</li>
	);
}

/** 菜单 / 气泡的触发器：要把 Radix 传来的 ref 与事件落到方块的 button 上。 */
function TileFaceTrigger({ item, ...props }: { readonly item: HeaderActionBarItem } & ComponentProps<"button">): JSX.Element {
	return (
		<button
			type="button"
			title={item.title}
			aria-label={item.title}
			{...props}
			disabled={item.disabled}
			className="relative flex h-7 w-8 items-center justify-center rounded-full text-foreground outline-none transition-colors hover:bg-foreground/[0.07] focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-40 data-[state=open]:bg-foreground/[0.1]"
		>
			<IconBox>{item.icon}</IconBox>
			<TileBadge badge={item.badge} />
		</button>
	);
}

/**
 * 拖动时跟手的那张图：浏览器默认拿元素本身截图，会带上半透明的玻璃底和描边，看起来像一团光斑。
 * 这里换成只有图标的一个小圆片。
 */
function setGhost(event: DragEvent): void {
	const source = event.currentTarget as HTMLElement;
	const icon = source.querySelector("svg, [class*='icon-']");
	const ghost = document.createElement("div");
	ghost.style.cssText =
		"position:fixed;top:-100px;left:-100px;width:32px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:9999px;background:rgba(128,128,128,0.35);";
	ghost.style.color = getComputedStyle(source).color;
	if (icon) ghost.append(icon.cloneNode(true));
	document.body.append(ghost);
	event.dataTransfer.setDragImage(ghost, 16, 14);
	setTimeout(() => ghost.remove(), 0);
}

export function HeaderActionBarView({ top, tray, pinned, maxTop, labels, onMove }: HeaderActionBarViewProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const [dragKey, setDragKey] = useState<string | null>(null);
	const [drop, setDrop] = useState<DropTarget | null>(null);

	const topFull = top.length >= maxTop;
	// 收纳里的角标不能被藏起来：汇总到小白条上（红色）。
	const trayAlert = tray.some((item) => item.badge !== undefined && item.badge !== 0);
	const draggingFromTop = dragKey !== null && top.some((item) => item.key === dragKey);
	// 托盘打开时显示空位；顶栏一个都没有时也留着，否则没有东西可以悬浮、点开托盘。
	const hasFreeSeat = (open || top.length === 0) && top.length < maxTop;

	const canDropIn = (zone: HeaderActionZone): boolean => zone === "tray" || draggingFromTop || !topFull;

	const endDrag = (): void => {
		setDragKey(null);
		setDrop(null);
	};

	const startDrag = (key: string) => (event: DragEvent) => {
		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData("text/plain", key);
		setDragKey(key);
		setGhost(event);
	};

	/** 悬在某个元素上：按左右半边决定插在它前面还是后面。 */
	const overAt = (zone: HeaderActionZone, index: number) => (event: DragEvent) => {
		if (dragKey === null || !canDropIn(zone)) return;
		event.preventDefault();
		event.stopPropagation();
		const rect = event.currentTarget.getBoundingClientRect();
		setDrop({ zone, index: index + (event.clientX > rect.left + rect.width / 2 ? 1 : 0) });
	};

	const dropOn = (zone: HeaderActionZone) => (event: DragEvent) => {
		event.preventDefault();
		event.stopPropagation();
		if (dragKey !== null && canDropIn(zone)) {
			const index = drop?.zone === zone ? drop.index : zone === "top" ? top.length : tray.length;
			onMove(dragKey, zone, index);
		}
		endDrag();
	};

	/** 区域空白处：放到末尾。 */
	const overZone = (zone: HeaderActionZone) => (event: DragEvent) => {
		if (dragKey === null || !canDropIn(zone)) return;
		event.preventDefault();
		setDrop((current) => (current?.zone === zone ? current : { zone, index: zone === "top" ? top.length : tray.length }));
	};

	// 直线指示插入位置；圆角按钮上画内阴影会变成一段弧，所以用伪元素。
	const lineBefore = "after:absolute after:inset-y-1 after:left-0 after:w-0.5 after:rounded-full after:bg-primary";
	const lineAfter = "after:absolute after:inset-y-1 after:right-0 after:w-0.5 after:rounded-full after:bg-primary";

	return (
		<div className="flex shrink-0 items-center gap-2">
		<div data-header-action-bar="true" className="group/header-actions relative shrink-0">
			<ButtonGroup onDragOver={overZone("top")} onDrop={dropOn("top")}>
				{/* 还有空位就在最左边留一个虚线席位（只一个，不把剩余席位都摆出来）。 */}
				{hasFreeSeat && (
					<span
						data-header-action-seat="true"
						aria-hidden="true"
						onDragOver={(event) => {
							if (dragKey === null || !canDropIn("top")) return;
							event.preventDefault();
							event.stopPropagation();
							setDrop({ zone: "top", index: 0 });
						}}
						onDrop={dropOn("top")}
						className={cn(
							"mr-0.5 h-7 w-8 shrink-0 rounded-full border border-dashed border-foreground/30 transition-colors",
							dragKey !== null && drop?.zone === "top" && drop.index === 0 && !draggingFromTop && "border-primary",
						)}
					/>
				)}
				{top.map((item, index) => (
					<BarItem
						key={item.key}
						item={item}
						// 只有托盘打开（编辑状态）时按钮才可拖，平时拖拽手势留给窗口。
						dragProps={
							open
								? {
										draggable: true,
										onDragStart: startDrag(item.key),
										onDragEnd: endDrag,
										onDragOver: overAt("top", index),
										onDrop: dropOn("top"),
									}
								: undefined
						}
						className={cn(
							dragKey === item.key && "opacity-40",
							drop?.zone === "top" && drop.index === index && lineBefore,
							drop?.zone === "top" && drop.index === top.length && index === top.length - 1 && lineAfter,
						)}
					/>
				))}
			</ButtonGroup>
			<Popover
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) endDrag();
				}}
			>
				<PopoverTrigger asChild>
					<button
						type="button"
						title={labels.customize}
						aria-label={labels.customize}
						data-header-action-tray-handle="true"
						className={cn(
							// 紧贴按钮组下沿的一条热区，始终接收指针：鼠标从按钮组往下挪的路上它还在，
							// 悬浮状态不会断；只有「看得见」是渐隐的，且消失前留 500ms 的余地。
							"no-drag absolute top-full left-1/2 z-10 flex h-4 w-14 -translate-x-1/2 items-center justify-center outline-none",
							"opacity-0 transition-opacity delay-500 duration-200",
							"group-hover/header-actions:opacity-100 group-hover/header-actions:delay-0",
							"group-focus-within/header-actions:opacity-100 group-focus-within/header-actions:delay-0",
							"hover:opacity-100 hover:delay-0 focus-visible:opacity-100 data-[state=open]:opacity-100 data-[state=open]:delay-0",
							trayAlert && "opacity-100",
						)}
					>
						<span
							className={cn(
								"h-1 w-8 rounded-full transition-colors",
								trayAlert ? "bg-red-500" : "bg-foreground/35 group-hover/header-actions:bg-foreground/50",
							)}
						/>
					</button>
				</PopoverTrigger>
				<PopoverContent
					align="end"
					sideOffset={8}
					className="w-auto gap-0 p-1.5"
					// 编辑状态下要在按钮组里拖拽、点按钮：落在按钮组上的按下不算「点了外面」，不关托盘。
					onInteractOutside={(event) => {
						if ((event.target as HTMLElement | null)?.closest("[data-header-action-bar]")) event.preventDefault();
					}}
					onOpenAutoFocus={(event) => event.preventDefault()}
				>
					<ul
						data-header-action-tray="true"
						onDragOver={overZone("tray")}
						onDrop={dropOn("tray")}
						className={cn(
							"grid grid-cols-[repeat(4,2rem)] gap-0.5",
							tray.length === 0 && "h-7 w-32 grid-cols-1 rounded-full border border-dashed border-foreground/30",
							tray.length === 0 && dragKey !== null && draggingFromTop && "border-primary",
						)}
					>
						{tray.map((item, index) => (
							<Tile
								key={item.key}
								item={item}
								index={index}
								count={tray.length}
								drop={drop}
								dragging={dragKey === item.key}
								moveDisabled={topFull}
								moveLabel={topFull ? labels.topFull : labels.moveToTop}
								onMoveClick={() => onMove(item.key, "top", Number.MAX_SAFE_INTEGER)}
								onDragStart={startDrag(item.key)}
								onDragEnd={endDrag}
								onDragOverTile={(event, at) => overAt("tray", at)(event)}
								onClose={() => setOpen(false)}
							/>
						))}
					</ul>
				</PopoverContent>
			</Popover>
		</div>
		{/* 活动面板开关是个独立的小组，固定在最右，不参与排序与收纳。 */}
		{pinned ? <ButtonGroup>{pinned}</ButtonGroup> : null}
		</div>
	);
}
