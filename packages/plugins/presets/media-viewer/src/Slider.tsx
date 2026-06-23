import { useMemo, useState } from "react";
import { cn } from "./utils";

interface SliderProps {
	className?: string;
	value?: number[];
	defaultValue?: number[];
	min?: number;
	max?: number;
	step?: number;
	disabled?: boolean;
	onValueChange?: (value: number[]) => void;
}

export function Slider({
	className,
	value,
	defaultValue,
	min = 0,
	max = 100,
	step = 1,
	disabled,
	onValueChange,
}: SliderProps): JSX.Element {
	const [internalValue, setInternalValue] = useState(() => defaultValue?.[0] ?? value?.[0] ?? min);
	const [dragging, setDragging] = useState(false);
	const current = value?.[0] ?? internalValue;
	const percent = useMemo(() => {
		if (max <= min) return 0;
		return Math.min(100, Math.max(0, ((current - min) / (max - min)) * 100));
	}, [current, min, max]);

	const changeValue = (next: number): void => {
		setInternalValue(next);
		onValueChange?.([next]);
	};

	return (
		<div
			data-slot="slider"
			data-disabled={disabled ? "" : undefined}
			className={cn(
				"relative flex w-full cursor-pointer touch-none select-none items-center data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
				className,
			)}
		>
			<div
				data-slot="slider-track"
				className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-[var(--muted)]"
			>
				<div
					data-slot="slider-range"
					className="absolute h-full bg-[var(--primary)]"
					style={{ left: 0, width: `${percent}%` }}
				/>
			</div>
			<div
				data-slot="slider-thumb"
				className={cn(
					"pointer-events-none absolute block w-1 shrink-0 rounded-full bg-[var(--primary)] outline-none ring-2 ring-[var(--background)] transition-[box-shadow,height] before:absolute before:-inset-x-2 before:inset-y-0 before:content-['']",
					dragging ? "h-5 ring-4" : "h-4",
				)}
				style={{ left: `${percent}%`, transform: "translateX(-50%)" }}
			/>
			<input
				type="range"
				value={current}
				min={min}
				max={max}
				step={step}
				disabled={disabled}
				onChange={(event) => changeValue(Number(event.currentTarget.value))}
				onPointerDown={() => setDragging(true)}
				onPointerUp={() => setDragging(false)}
				onPointerCancel={() => setDragging(false)}
				onBlur={() => setDragging(false)}
				className="absolute inset-x-0 h-5 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
			/>
		</div>
	);
}
