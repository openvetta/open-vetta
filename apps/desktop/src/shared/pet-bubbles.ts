/** 桌宠对话气泡的外观。只保留一种默认样式，主题可以通过覆盖 CSS 变量调整颜色。 */
export const PET_BUBBLE_SURFACE = {
	bodyClassName:
		"relative min-w-40 max-w-full break-words rounded-xl border border-border/60 bg-popover/90 px-12 py-3 text-center text-[12px] font-medium leading-5 text-popover-foreground shadow-lg backdrop-blur-sm",
	textClassName: "relative max-h-20 min-w-0 overflow-hidden",
} as const;
