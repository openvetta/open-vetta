import { cn } from "@vetta-org/ui/utils";
import { Slot } from "radix-ui";
import "./message-feed-fade.css";
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
	// 上下渐隐（含沉浸式顶栏那一段）写在 message-feed-fade.css：它是两层 mask，
	// 第二层专门把右缘滚动条槽位补成不透明，否则 mask 会连滚动条一起淡出，
	// 滚到最顶或最底时滑块的头部/尾部会被抹掉一截。用 mask 而不是盖一层底色，
	// 毛玻璃 / 自定义背景下也成立，且不需要背景模糊。
	// 静止时的顶部留白不能放在这个滚动容器的 padding 上：Virtuoso 的视口是
	// position:absolute; top:0; height:100%，会盖住 padding，滚到顶时第一条消息仍从窗口顶边开始，被顶栏和渐隐挡住。
	// 留白在列表 Header（MessageFeedLayoutTopInset）。滚到顶时第一条消息从顶栏下沿再留一点空隙开始，不必等到渐隐完全结束。
	// 列表底部留白见 MessageFeedLayoutList。
	"message-feed-fade min-h-0 flex-1 pt-4",
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

/**
 * 滚到顶时把第一条消息让出沉浸式顶栏和渐隐区。
 * 必须放在列表流里（Virtuoso Header）：滚动容器上的 padding 会被 Virtuoso 绝对定位的视口盖住，
 * 第一条消息仍会从窗口顶边开始。80px 让开顶栏（约 52px），并比渐隐结束线再高一点；
 * 没有沉浸式顶栏时高度为 0。
 */
export function MessageFeedLayoutTopInset() {
	return (
		<div
			aria-hidden
			data-message-feed-layout-part="top-inset"
			className="h-0 shrink-0 [[data-header-overlay=true]_&]:h-[80px]"
		/>
	);
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

