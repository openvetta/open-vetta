import { useCallback } from "react";
import type { IntervalSchedule } from "./cron-utils";

interface IntervalModeProps {
	schedule: IntervalSchedule;
	onChange: (schedule: IntervalSchedule) => void;
}

type IntervalPreset = 1 | 24 | 168;

const PRESET_OPTIONS: { value: IntervalPreset; label: string }[] = [
	{ value: 1, label: "每隔 1 小时" },
	{ value: 24, label: "每隔 1 天" },
	{ value: 168, label: "每隔 1 周" },
];

/** Returns true if the given hours matches a preset */
function isPreset(hours: number): hours is IntervalPreset {
	return hours === 1 || hours === 24 || hours === 168;
}

export function IntervalMode({ schedule, onChange }: IntervalModeProps): JSX.Element {
	const isCustom = !isPreset(schedule.intervalHours);

	const handlePresetChange = useCallback(
		(preset: IntervalPreset) => {
			onChange({ ...schedule, intervalHours: preset });
		},
		[schedule, onChange],
	);

	const handleCustomChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const n = parseInt(e.target.value, 10);
			if (!isNaN(n) && n >= 1) {
				onChange({ ...schedule, intervalHours: n });
			}
		},
		[schedule, onChange],
	);

	const handleCustomInput = useCallback(() => {
		onChange({ ...schedule, intervalHours: 2 });
	}, [schedule, onChange]);

	return (
		<div className="flex flex-col gap-3">
			{/* Preset options */}
			<div className="flex flex-wrap gap-2">
				{PRESET_OPTIONS.map((opt) => (
					<button
						key={opt.value}
						type="button"
						onClick={() => handlePresetChange(opt.value)}
						className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
							!isCustom && schedule.intervalHours === opt.value
								? "bg-[var(--accent)] text-white"
								: "bg-[var(--surface-raised)] text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-[var(--text-1)]"
						}`}
					>
						{opt.label}
					</button>
				))}
				<button
					type="button"
					onClick={handleCustomInput}
					className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
						isCustom
							? "bg-[var(--accent)] text-white"
							: "bg-[var(--surface-raised)] text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-[var(--text-1)]"
					}`}
				>
					自定义
				</button>
			</div>

			{/* Custom hour input — always shown when in custom mode */}
			{isCustom && (
				<div className="flex items-center gap-2">
					<span className="text-sm text-[var(--text-2)]">每隔</span>
					<input
						type="number"
						value={schedule.intervalHours}
						min={1}
						onChange={handleCustomChange}
						className="h-8 w-16 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-center text-sm text-[var(--text-1)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
					/>
					<span className="text-sm text-[var(--text-2)]">小时</span>
				</div>
			)}
		</div>
	);
}
