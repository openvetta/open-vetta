import * as React from "react";
import { ButtonGroup, ButtonGroupItem, type ButtonGroupItemProps, type ButtonGroupShape, useInButtonGroup } from "./button-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./dropdown-menu";
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
	readonly onSelect: () => void;
	readonly disabled?: boolean;
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
}

const TRIGGER_OPEN_CLASS = "data-[state=open]:bg-foreground/[0.1]";

function SessionTopItem({
	shape = "pill",
	onClick,
	menuItems,
	popoverContent,
	open,
	onOpenChange,
	align = "end",
	popoverClassName,
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
					{menuItems.map((entry) => (
						<React.Fragment key={entry.id}>
							{entry.separatorBefore ? <DropdownMenuSeparator /> : null}
							<DropdownMenuItem
								disabled={entry.disabled}
								onSelect={entry.onSelect}
								className={entry.destructive ? "text-destructive focus:text-destructive" : undefined}
							>
								{entry.icon ? <span className="flex size-4 shrink-0 items-center justify-center">{entry.icon}</span> : null}
								{entry.label}
							</DropdownMenuItem>
						</React.Fragment>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		);
	} else if (popoverContent !== undefined) {
		item = (
			<Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
				<PopoverTrigger asChild>
					<ButtonGroupItem {...itemProps} className={triggerClassName} />
				</PopoverTrigger>
				<PopoverContent
					align={align}
					sideOffset={8}
					// 宽高随内容；最大值兜底，超出滚动。背景 / 圆角 / 投影来自宿主浮层皮肤，不在此覆盖。
					className={cn("w-max max-h-[min(70vh,32rem)] max-w-[min(92vw,32rem)] overflow-auto", popoverClassName)}
				>
					{typeof popoverContent === "function"
						? popoverContent({ close: () => setPopoverOpen(false) })
						: popoverContent}
				</PopoverContent>
			</Popover>
		);
	} else {
		item = <ButtonGroupItem {...itemProps} className={className} onClick={onClick} />;
	}

	return inGroup ? item : <ButtonGroup shape={shape}>{item}</ButtonGroup>;
}

/** 顶栏里的一组 `SessionTopItem`，就是 `ButtonGroup`（别名，让调用处读起来是同一套东西）。 */
const SessionTopGroup = ButtonGroup;

export { SessionTopGroup, SessionTopItem };
