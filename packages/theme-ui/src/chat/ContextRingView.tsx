import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { JSX } from "react";

const SIZE = 16;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SPIN_ARC = CIRCUMFERENCE * 0.25;

/**
 * 空着那段（轨道）的颜色与浓度。
 *
 * 不用 --secondary：它在多数主题里与输入栏底色只差几级（深色约 1.0~1.1:1），再乘 50%
 * 铺上去等于没画，用户看不出圈里还剩多少。--muted-foreground 是各主题都保证与表面拉得
 * 开的文字级灰，取 35% 后深浅两套配色与全部内置主题都稳定落在 1.6~2.0:1——是一道看得
 * 见的槽，又压不过 --primary 画的进度弧。透明度留在属性上而不是写进 color-mix，是为了
 * 让半透明输入栏、插件浮层下面透出的东西都照常参与合成。
 */
const TRACK_STROKE = "var(--muted-foreground, #888)";
const TRACK_OPACITY = 0.35;

export interface ContextRingViewProps {
	/** Progress 0–100; ignored while compacting. */
	percent: number;
	/** Precomputed dashoffset for progress arc. */
	offset: number;
	/** Progress arc stroke color. */
	color: string;
	isCompacting: boolean;
	tooltip: string;
	className?: string;
}

/**
 * 提示走 Radix Portal 挂到 body，不在圈内做绝对定位。
 *
 * 输入栏所在的列带 `isolate` 与 `overflow-clip`（见 DefaultChatView 的 layout 注释），
 * 圈内绝对定位的元素既会被那圈裁掉、也压不过右邻的活动面板，靠提 z-index 救不回来；
 * 挂出文档流后两端都不成立。只对齐到圈的右缘（align end），长文案往左伸，不去挤面板。
 */
export function ContextRingView({
	percent: _percent,
	offset,
	color,
	isCompacting,
	tooltip,
	className,
}: ContextRingViewProps): JSX.Element {
	return (
		<TooltipPrimitive.Provider delayDuration={200}>
			<TooltipPrimitive.Root>
				<TooltipPrimitive.Trigger asChild>
					<div className={`relative flex items-center cursor-default${className ? ` ${className}` : ""}`}>
						<svg
							width={SIZE}
							height={SIZE}
							className={isCompacting ? "" : "rotate-[-90deg]"}
							style={isCompacting ? { animation: "context-ring-spin 1s linear infinite" } : undefined}
						>
							<circle
								cx={SIZE / 2}
								cy={SIZE / 2}
								r={RADIUS}
								fill="none"
								stroke={TRACK_STROKE}
								strokeWidth={STROKE}
								opacity={TRACK_OPACITY}
							/>
							{isCompacting ? (
								<circle
									cx={SIZE / 2}
									cy={SIZE / 2}
									r={RADIUS}
									fill="none"
									stroke="#f59e0b"
									strokeWidth={STROKE}
									strokeDasharray={`${SPIN_ARC} ${CIRCUMFERENCE - SPIN_ARC}`}
									strokeLinecap="round"
								/>
							) : (
								<circle
									cx={SIZE / 2}
									cy={SIZE / 2}
									r={RADIUS}
									fill="none"
									stroke={color}
									strokeWidth={STROKE}
									strokeDasharray={CIRCUMFERENCE}
									strokeDashoffset={offset}
									strokeLinecap="round"
									style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.3s ease" }}
								/>
							)}
						</svg>
					</div>
				</TooltipPrimitive.Trigger>
				<TooltipPrimitive.Portal>
					<TooltipPrimitive.Content
						side="top"
						align="end"
						sideOffset={8}
						className="pointer-events-none z-50 whitespace-nowrap rounded-md px-2 py-1 text-[11px] text-foreground"
						style={{
							background: "var(--secondary, #2a2a2a)",
							boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
						}}
					>
						{tooltip}
					</TooltipPrimitive.Content>
				</TooltipPrimitive.Portal>
			</TooltipPrimitive.Root>
		</TooltipPrimitive.Provider>
	);
}

export { CIRCUMFERENCE };
