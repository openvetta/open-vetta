import * as React from "react";
import { ButtonGroup, ButtonGroupItem, type ButtonGroupItemProps, type ButtonGroupShape, useInButtonGroup } from "./button-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "./dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./dialog";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "./utils";

/**
 * 会话页顶栏的「一项」：宿主内置按钮与插件贡献（`registerHeaderAction`）共用同一个组件，
 * 外观、弹层、间距都由它统一。
 *
 * 外观：与顶栏右侧的按钮组一致的按钮（图标 / 文字 / 角标 / 选中态，见 `ButtonGroupItem`）。
 * 单独使用时它自己包一层胶囊（单按钮的按钮组）；放进 `SessionTopGroup`（即 `ButtonGroup`）
 * 里就是组内的一格——同一个组件，两种形态，不用选两套 API。
 *
 * 点击行为三选一（互斥，`menuItems` 优先于 `popoverContent`）：
 * - `menuItems`：向下展开下拉菜单，适合「从外部应用打开」这类选一项就执行的场景；
 * - `popoverContent`：向下弹出气泡，内容完全由调用方决定，适合表单、列表、状态面板；
 * - 都不传：普通按钮，走 `onClick`。
 *
 * 气泡与菜单的背景、圆角、投影固定为宿主的浮层皮肤，调用方改不了；宽高随内容自适应
 * （气泡有最大宽高兜底，超出滚动）。
 */

export interface SessionTopMenuItem {
	readonly id: string;
	readonly label: React.ReactNode;
	readonly icon?: React.ReactNode;
	readonly onSelect?: () => void;
	/**
	 * 菜单项类型，默认 `item`：`checkbox` / `radio` 带勾选标记且点击后菜单不关；
	 * `label` 是分组标题；`loading` / `empty` 是自动禁用的占位行；`submenu` 展开 `children`（只支持一层）。
	 */
	readonly kind?: "item" | "checkbox" | "radio" | "label" | "loading" | "empty" | "submenu";
	/** `submenu` 的下一级菜单项。 */
	readonly children?: readonly SessionTopMenuItem[];
	/** `checkbox` / `radio` 是否已选中。 */
	readonly checked?: boolean;
	readonly disabled?: boolean;
	/** 禁用原因，鼠标悬浮时显示。 */
	readonly disabledReason?: string;
	/** 危险操作（红色）。 */
	readonly destructive?: boolean;
	/** 在这一项之前画一条分隔线。 */
	readonly separatorBefore?: boolean;
}

export interface SessionTopPopoverApi {
	/** 关闭气泡（例如内容里点了「完成」）。 */
	readonly close: () => void;
}

export interface SessionTopItemProps extends Omit<ButtonGroupItemProps, "onClick" | "popover"> {
	/** 单独使用时胶囊的外观，默认 `pill`；放在 `ButtonGroup` 里时跟随组，此项无效。 */
	shape?: ButtonGroupShape;
	/** 普通按钮的点击回调；带 `menuItems` / `popoverContent` 时不触发。 */
	onClick?: () => void;
	/** 下拉菜单项。传了就是下拉模式。 */
	menuItems?: readonly SessionTopMenuItem[];
	/** 气泡内容；传函数可拿到 `close`。传了（且没有 `menuItems`）就是气泡模式。 */
	popoverContent?: React.ReactNode | ((api: SessionTopPopoverApi) => React.ReactNode);
	/** 受控打开状态（仅气泡模式）。 */
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	/** 弹层对齐，默认 `end`：与触发按钮右缘对齐，不会往窗口外溢出。 */
	align?: "start" | "center" | "end";
	/** 气泡内容区额外 class（如去掉内边距 `p-0`）。背景 / 圆角 / 投影不可改。 */
	popoverClassName?: string;
	/** 气泡宽度档位：`sm` 约 16rem、`md` 默认、`lg` 约 32rem。 */
	popoverSize?: "sm" | "md" | "lg";
	/** 气泡容器：默认贴着按钮的小浮层；`dialog` 换成宿主居中对话框（适合带输入框、列表的界面）。 */
	popoverHost?: "popover" | "dialog";
	/** 对话框的标题（`popoverHost="dialog"` 时用于无障碍名称），默认用 `title`。 */
	dialogTitle?: string;
}

/** 弹层里一行的图标位置：固定 16px，与按钮上的图标同尺寸。 */
function MenuIcon({ children }: { readonly children: React.ReactNode }): React.ReactElement {
	return <span className="pointer-events-none flex size-4 shrink-0 items-center justify-center overflow-hidden">{children}</span>;
}

const CHECK_ICON = <span className="icon-[solar--check-circle-linear] pointer-events-none size-4" />;

/**
 * 下拉菜单项的统一渲染：顶栏按钮、收纳托盘、窄屏「更多」三处共用，保证同一个声明到哪都长一样。
 * 单选 / 复选不自动关菜单（`preventDefault`）——点一下看到勾选变化才算反馈。
 */
export function SessionTopMenuItems({
	items,
	onClose,
}: {
	readonly items: readonly SessionTopMenuItem[];
	readonly onClose?: () => void;
}): React.ReactElement {
	return (
		<>
			{items.map((entry) => (
				<SessionTopMenuEntry key={entry.id} entry={entry} onClose={onClose} />
			))}
		</>
	);
}

function SessionTopMenuEntry({
	entry,
	onClose,
}: {
	readonly entry: SessionTopMenuItem;
	readonly onClose?: () => void;
}): React.ReactElement {
	const separator = entry.separatorBefore ? <DropdownMenuSeparator /> : null;
	const kind = entry.kind ?? "item";

	if (kind === "submenu") {
		return (
			<>
				{separator}
				<DropdownMenuSub>
					<DropdownMenuSubTrigger disabled={entry.disabled} title={entry.disabled ? entry.disabledReason : undefined}>
						{entry.icon ? <MenuIcon>{entry.icon}</MenuIcon> : null}
						{entry.label}
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="min-w-40">
						<SessionTopMenuItems items={entry.children ?? []} onClose={onClose} />
					</DropdownMenuSubContent>
				</DropdownMenuSub>
			</>
		);
	}

	if (kind === "label") {
		return (
			<>
				{separator}
				<DropdownMenuLabel className="text-muted-foreground text-[11px] font-medium">{entry.label}</DropdownMenuLabel>
			</>
		);
	}

	// loading / empty 是「此刻没东西」的说明行，永远不可点。
	const inert = kind === "loading" || kind === "empty";
	const selectable = kind === "checkbox" || kind === "radio";
	const leading = selectable && entry.checked ? CHECK_ICON : entry.icon ? <MenuIcon>{entry.icon}</MenuIcon> : null;

	return (
		<>
			{separator}
			<DropdownMenuItem
				disabled={inert || entry.disabled}
				title={entry.disabled ? entry.disabledReason : undefined}
				aria-checked={selectable ? entry.checked === true : undefined}
				onSelect={(event) => {
					// 开关型菜单项：勾选标记就是反馈，关掉菜单会让用户以为没生效。
					if (selectable) event.preventDefault();
					entry.onSelect?.();
					if (!selectable) onClose?.();
				}}
				className={cn(
					entry.destructive && "text-destructive focus:text-destructive",
					inert && "text-muted-foreground",
				)}
			>
				{kind === "loading" ? (
					<span className="icon-[solar--refresh-linear] pointer-events-none size-4 shrink-0 animate-spin" />
				) : (
					leading
				)}
				{entry.label}
			</DropdownMenuItem>
		</>
	);
}

const TRIGGER_OPEN_CLASS = "data-[state=open]:bg-foreground/[0.1]";

const POPOVER_WIDTH = {
	sm: "w-max max-w-[min(92vw,16rem)]",
	md: "w-max max-w-[min(92vw,24rem)]",
	lg: "w-max max-w-[min(92vw,32rem)]",
} as const;

function SessionTopItem({
	shape = "pill",
	onClick,
	menuItems,
	popoverContent,
	open,
	onOpenChange,
	align = "end",
	popoverClassName,
	popoverSize = "md",
	popoverHost = "popover",
	dialogTitle,
	className,
	...itemProps
}: SessionTopItemProps) {
	const inGroup = useInButtonGroup();
	const [innerOpen, setInnerOpen] = React.useState(false);
	const popoverOpen = open ?? innerOpen;
	const setPopoverOpen = (next: boolean) => {
		if (open === undefined) setInnerOpen(next);
		onOpenChange?.(next);
	};

	const triggerClassName = cn(TRIGGER_OPEN_CLASS, className);
	let item: React.ReactNode;

	if (menuItems && menuItems.length > 0) {
		item = (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<ButtonGroupItem {...itemProps} className={triggerClassName} />
				</DropdownMenuTrigger>
				<DropdownMenuContent align={align} sideOffset={8} className="min-w-40">
					<SessionTopMenuItems items={menuItems} />
				</DropdownMenuContent>
			</DropdownMenu>
		);
	} else if (popoverContent !== undefined) {
		const content = typeof popoverContent === "function" ? popoverContent({ close: () => setPopoverOpen(false) }) : popoverContent;
		if (popoverHost === "dialog") {
			item = (
				<Dialog open={popoverOpen} onOpenChange={setPopoverOpen}>
					<DialogTrigger asChild>
						<ButtonGroupItem {...itemProps} className={triggerClassName} />
					</DialogTrigger>
					<DialogContent className={cn("max-h-[min(80vh,40rem)] overflow-auto", POPOVER_WIDTH[popoverSize])}>
						<DialogHeader>
							<DialogTitle className="text-[15px]">{dialogTitle ?? itemProps.title}</DialogTitle>
						</DialogHeader>
						{content}
					</DialogContent>
				</Dialog>
			);
		} else {
			item = (
				<Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
					<PopoverTrigger asChild>
						<ButtonGroupItem {...itemProps} className={triggerClassName} />
					</PopoverTrigger>
					<PopoverContent
						align={align}
						sideOffset={8}
						// 宽高随内容；最大值兜底，超出滚动。背景 / 圆角 / 投影来自宿主浮层皮肤，不在此覆盖。
						className={cn("max-h-[min(70vh,32rem)] overflow-auto", POPOVER_WIDTH[popoverSize], popoverClassName)}
					>
						{content}
					</PopoverContent>
				</Popover>
			);
		}
	} else {
		item = <ButtonGroupItem {...itemProps} className={className} onClick={onClick} />;
	}

	return inGroup ? item : <ButtonGroup shape={shape}>{item}</ButtonGroup>;
}

/** 顶栏里的一组 `SessionTopItem`，就是 `ButtonGroup`（别名，让调用处读起来是同一套东西）。 */
const SessionTopGroup = ButtonGroup;

export { SessionTopGroup, SessionTopItem };
