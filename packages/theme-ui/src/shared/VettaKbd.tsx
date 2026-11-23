import { Fragment, type JSX } from "react";
import { cn } from "@vetta-org/ui";
import {
	describeKbdKeys,
	detectKbdPlatform,
	resolveKbdKeys,
	type VettaKbdKey,
	type VettaKbdPlatform,
} from "./kbd-keys";

export type VettaKbdSize = "xs" | "sm";
/**
 * raised：浮雕键帽（默认）；flat：玻璃面板上的线框键帽，只画一圈大圆角细描边，不铺底色、不画投影。
 * flat 的描边和键面符号取同一个前景色，只降不透明度：同色同调才读成一个键帽，
 * 灰色在玻璃底上会发脏；描边要明显淡于符号（符号用实色前景，描边只取五分之一），连续线条比字形笔画显得亮，数值接近时边框会盖过键位。
 */
export type VettaKbdVariant = "raised" | "flat";

export interface VettaKbdProps {
	/** 快捷键串（"mod+shift+k"）或键位列表；列表项可写成按平台取值的对象。 */
	readonly keys: string | readonly VettaKbdKey[];
	/** 强制平台；默认按当前窗口平台判断。 */
	readonly platform?: VettaKbdPlatform;
	readonly size?: VettaKbdSize;
	readonly variant?: VettaKbdVariant;
	/** 键之间显示 "+" 连接符（默认只靠间距分组）。 */
	readonly separator?: boolean;
	readonly className?: string;
}

// 轻拟物键帽：顶部内高光 + 底部落影，与应用快照的键盘预览同一套浮雕观感。
// 键面用前景色叠层而非固定底色，所以放在 card / muted / popover 上都能浮起来：
// 浅色主题靠淡灰压深底边，深色主题靠淡白提亮顶面。
const CAP_RAISED = cn(
	"inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium leading-none",
	"bg-gradient-to-b from-foreground/[0.03] to-foreground/[0.09] text-foreground",
	"dark:from-foreground/[0.1] dark:to-foreground/[0.03]",
	"border border-black/[0.08] dark:border-white/[0.08]",
	"shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_1.5px_rgba(0,0,0,0.14),0_2px_3px_-1px_rgba(0,0,0,0.12)]",
	"dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_1.5px_2px_rgba(0,0,0,0.55)]",
);

const CAP_FLAT = cn(
	"inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium leading-none",
	"border border-foreground/20 bg-transparent text-foreground",
);

const SIZE_CLASS: Record<VettaKbdSize, string> = {
	xs: "h-[18px] min-w-[18px] rounded-[4px] px-1 text-[10px]",
	sm: "h-[22px] min-w-[22px] rounded-[5px] px-1.5 text-[11px]",
};

// 线框键帽没有底色撑面积，内边距收紧、符号放大、圆角加大，键位才不显得空。
const FLAT_SIZE_CLASS: Record<VettaKbdSize, string> = {
	xs: "h-[18px] min-w-[18px] rounded-[6px] px-[3px] text-[11px]",
	sm: "h-[22px] min-w-[22px] rounded-[7px] px-[3px] text-[13px]",
};

/**
 * 快捷键键帽展示：把 "mod+shift+k" 这类串渲染成一组浮雕键帽。
 *
 * 平台差异由 keys 里的 token 承担：mod 在 mac 显示 ⌘、windows 显示 Ctrl；
 * ctrl 在 mac 显示 ⌃、windows 显示 Ctrl；需要更细的分系统差异时直接传对象项。
 */
export function VettaKbd({
	keys,
	platform,
	size = "xs",
	variant = "raised",
	separator = false,
	className,
}: VettaKbdProps): JSX.Element | null {
	const resolvedPlatform = platform ?? detectKbdPlatform();
	const labels = resolveKbdKeys(keys, resolvedPlatform);
	if (labels.length === 0) return null;

	return (
		<span
			className={cn("inline-flex shrink-0 select-none items-center gap-1 align-middle", className)}
			role="img"
			aria-label={describeKbdKeys(keys, resolvedPlatform)}
		>
			{labels.map((label, index) => (
				<Fragment
					// biome-ignore lint/suspicious/noArrayIndexKey: 组合键各段固定顺序，同一个键可能重复出现
					key={`${index}-${label}`}
				>
					{separator && index > 0 && (
						<span aria-hidden="true" className="text-[10px] font-medium leading-none text-muted-foreground/60">
							+
						</span>
					)}
					<kbd aria-hidden="true" className={variant === "flat" ? cn(CAP_FLAT, FLAT_SIZE_CLASS[size]) : cn(CAP_RAISED, SIZE_CLASS[size])}>
						{label}
					</kbd>
				</Fragment>
			))}
		</span>
	);
}
