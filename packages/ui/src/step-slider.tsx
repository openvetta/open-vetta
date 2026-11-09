import type { JSX } from "react";
import { Button } from "./button";
import { Slider } from "./slider";

export interface StepSliderProps {
	/** 每一档的文字，显示在轨道下方，点击直接跳到该档。 */
	labels: readonly string[];
	/** 当前（含拖动中预览）所在档的下标。 */
	index: number;
	disabled?: boolean;
	/** 在轨道上画出每一档的刻度点。 */
	showTicks?: boolean;
	"aria-label"?: string;
	"aria-valuetext"?: string;
	/** 拖动经过某一档时触发（吸附后的下标）。 */
	onIndexChange?: (index: number) => void;
	/** 松手、点击标签或键盘操作后触发。 */
	onIndexCommit: (index: number) => void;
	/** 拖动被系统打断（pointercancel）。 */
	onCancel?: () => void;
}

/** 吸附到离散档位的滑块：轨道两端缩进半档，使端点正对首尾标签的中心。 */
export function StepSlider({
	labels,
	index,
	disabled,
	showTicks,
	"aria-label": ariaLabel,
	"aria-valuetext": ariaValueText,
	onIndexChange,
	onIndexCommit,
	onCancel,
}: StepSliderProps): JSX.Element {
	const last = Math.max(0, labels.length - 1);
	return (
		<div className="grid" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
			<div
				className="relative col-span-full"
				onPointerCancelCapture={onCancel}
				style={{ marginInline: `${50 / labels.length}%` }}
			>
				<Slider
					value={[index]}
					min={0}
					max={last}
					step={1}
					animateValue
					className="data-[disabled]:opacity-100"
					disabled={disabled || labels.length < 2}
					aria-label={ariaLabel}
					aria-valuetext={ariaValueText}
					onValueChange={([next]) => onIndexChange?.(next ?? index)}
					onValueCommit={([next]) => onIndexCommit(next ?? index)}
				/>
				{showTicks ? (
					<div aria-hidden className="pointer-events-none absolute inset-0">
						{labels.map((label, tick) => (
							<span
								key={label}
								className="absolute top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background/70"
								style={{ left: `${last === 0 ? 0 : (tick / last) * 100}%` }}
							/>
						))}
					</div>
				) : null}
			</div>
			{labels.map((label, tick) => (
				<Button
					key={label}
					variant="ghost"
					size="sm"
					className={
						index === tick
							? "h-6 min-w-0 px-0 text-[11px] text-primary disabled:opacity-100"
							: "h-6 min-w-0 px-0 text-[11px] disabled:opacity-100"
					}
					disabled={disabled}
					aria-pressed={index === tick}
					onClick={() => onIndexCommit(tick)}
				>
					{label}
				</Button>
			))}
		</div>
	);
}
