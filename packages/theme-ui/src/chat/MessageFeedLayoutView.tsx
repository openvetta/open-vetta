import { cn } from "@vetta-org/ui/utils";
import { Slot } from "radix-ui";
import type { ComponentPropsWithoutRef, CSSProperties } from "react";
import { forwardRef } from "react";
import { useMessageFeedContext } from "./MessageFeedContext";

export interface MessageFeedLayoutPrimitiveProps extends ComponentPropsWithoutRef<"div"> {
	readonly asChild?: boolean;
}

export interface MessageFeedListLayoutProps {
	readonly className?: string;
	readonly style?: CSSProperties;
}

export const MessageFeedLayoutFrame = createFeedLayoutPart(
	"Frame",
	"@container relative flex min-h-0 flex-1 flex-col",
);
export const MessageFeedLayoutViewport = createFeedLayoutPart(
	"Viewport",
	"flex min-h-0 min-w-0 flex-1 flex-col",
);
export const MessageFeedLayoutVirtualizer = createFeedLayoutPart(
	"Virtualizer",
	// 沉浸式顶栏（main[data-header-overlay]）下，顶栏浮在消息流上：静止时顶部留出顶栏加渐隐区的高度，
	// 滚动时内容在顶栏那一段（28px）内完全隐去，再沿一条缓入缓出的曲线在约 70px 内渐显
	// （多段色标近似 ease-in-out，线性渐变会在两端出现可见的「硬边」），标题不会与正文叠在一起，像 iOS 的 soft titlebar。用 mask 而不是盖一层底色，
	// 毛玻璃 / 自定义背景下也成立，且不需要背景模糊。
	// 底部（输入框上沿）同样有 32px 渐隐，文字退出时不会被输入框硬切；列表底部留白见 MessageFeedLayoutList。
	"min-h-0 flex-1 pt-4 [mask-image:linear-gradient(to_bottom,black_calc(100%-32px),rgb(0_0_0/0.8)_calc(100%-24px),rgb(0_0_0/0.45)_calc(100%-16px),rgb(0_0_0/0.15)_calc(100%-8px),transparent_100%)] [[data-header-overlay=true]_&]:pt-24 [[data-header-overlay=true]_&]:[mask-image:linear-gradient(to_bottom,transparent_0,transparent_28px,rgb(0_0_0/0.04)_36px,rgb(0_0_0/0.14)_46px,rgb(0_0_0/0.33)_58px,rgb(0_0_0/0.58)_70px,rgb(0_0_0/0.8)_82px,rgb(0_0_0/0.94)_92px,black_100px,black_calc(100%-32px),rgb(0_0_0/0.8)_calc(100%-24px),rgb(0_0_0/0.45)_calc(100%-16px),rgb(0_0_0/0.15)_calc(100%-8px),transparent_100%)]",
	{ overflowX: "hidden" },
);
export const MessageFeedLayoutLeftRail = createFeedLayoutPart(
	"LeftRail",
	"pointer-events-none absolute top-1/2 left-3 z-20 -translate-y-1/2 @max-[52rem]:hidden",
);
export const MessageFeedLayoutRailContent = createFeedLayoutPart(
	"RailContent",
	"pointer-events-auto",
);
export const MessageFeedLayoutState = createFeedLayoutPart(
	"State",
	"flex min-h-0 flex-1 flex-col",
);

/** Declares the DOM layout Virtuoso should use for its internal item list. */
export const MessageFeedLayoutList = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
	function MessageFeedLayoutList({ className, style, ...props }, forwardedRef) {
		useMessageFeedContext("MessageFeedLayout.List");
		return (
			<div
				ref={forwardedRef}
				className={cn(
					// 不加 overflow-hidden：宽表要能用负 margin 探出阅读栏。
					// 真正的横向裁剪由外层 Virtualizer（overflowX: hidden）在视口边界完成。
					"mx-auto flex max-w-3xl flex-col px-5 pb-8",
					className,
				)}
				style={style}
				data-message-feed-layout-part="list"
				{...props}
			/>
		);
	},
);

function createFeedLayoutPart(
	name: string,
	baseClassName: string,
	baseStyle?: CSSProperties,
) {
	return forwardRef<HTMLDivElement, MessageFeedLayoutPrimitiveProps>(function FeedLayoutPart(
		{ asChild = false, children, className, style, ...props },
		forwardedRef,
	) {
		useMessageFeedContext(`MessageFeedLayout.${name}`);
		const Comp = asChild ? Slot.Root : "div";
		return (
			<Comp
				ref={forwardedRef}
				className={cn(baseClassName, className)}
				style={{ ...baseStyle, ...style }}
				data-message-feed-root={name === "Frame" ? "" : undefined}
				data-message-feed-layout-part={name.toLowerCase()}
				{...props}
			>
				{children}
			</Comp>
		);
	});
}

export const MessageFeedLayout = {
	Frame: MessageFeedLayoutFrame,
	Viewport: MessageFeedLayoutViewport,
	Virtualizer: MessageFeedLayoutVirtualizer,
	List: MessageFeedLayoutList,
	LeftRail: MessageFeedLayoutLeftRail,
	RailContent: MessageFeedLayoutRailContent,
	State: MessageFeedLayoutState,
} as const;
