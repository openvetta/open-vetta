import { useState, useEffect, useCallback } from "react";
import { cn } from "@/renderer/lib/utils";
import { Input } from "@/renderer/components/ui/input";

interface TimePickerProps {
	/** Selected hour (0-23) */
	hour: number;
	/** Selected minute (0-59) */
	minute: number;
	/** Called when hour changes */
	onHourChange: (hour: number) => void;
	/** Called when minute changes */
	onMinuteChange: (minute: number) => void;
	className?: string;
}

/**
 * Hour and minute picker with separate input fields.
 * Supports keyboard navigation and direct number input.
 */
export function TimePicker({ hour, minute, onHourChange, onMinuteChange, className }: TimePickerProps): JSX.Element {
	const [hourStr, setHourStr] = useState(() => String(hour));
	const [minuteStr, setMinuteStr] = useState(() => String(minute).padStart(2, "0"));

	useEffect(() => {
		setHourStr(String(hour));
	}, [hour]);

	useEffect(() => {
		setMinuteStr(String(minute).padStart(2, "0"));
	}, [minute]);

	const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

	const handleHourChange = useCallback((raw: string) => {
		setHourStr(raw);
		const n = parseInt(raw, 10);
		if (!isNaN(n)) {
			onHourChange(clamp(n, 0, 23));
		}
	}, [onHourChange]);

	const handleMinuteChange = useCallback((raw: string) => {
		setMinuteStr(raw);
		const n = parseInt(raw, 10);
		if (!isNaN(n)) {
			onMinuteChange(clamp(n, 0, 59));
		}
	}, [onMinuteChange]);

	const handleHourBlur = useCallback(() => {
		setHourStr(String(hour));
	}, [hour]);

	const handleMinuteBlur = useCallback(() => {
		setMinuteStr(String(minute).padStart(2, "0"));
	}, [minute]);

	return (
		<div className={cn("flex items-center gap-1", className)}>
			{/* Hour */}
			<input
				type="number"
				value={hourStr}
				min={0}
				max={23}
				onChange={(e) => handleHourChange(e.target.value)}
				onBlur={handleHourBlur}
				className={cn(
					"h-8 w-12 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-center text-sm text-[var(--text-1)]",
					"focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]",
					"[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
				)}
				aria-label="小时"
			/>
			<span className="text-[var(--text-2)] text-sm font-medium">:</span>
			{/* Minute */}
			<input
				type="number"
				value={minuteStr}
				min={0}
				max={59}
				onChange={(e) => handleMinuteChange(e.target.value)}
				onBlur={handleMinuteBlur}
				className={cn(
					"h-8 w-12 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-center text-sm text-[var(--text-1)]",
					"focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]",
					"[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
				)}
				aria-label="分钟"
			/>
		</div>
	);
}
