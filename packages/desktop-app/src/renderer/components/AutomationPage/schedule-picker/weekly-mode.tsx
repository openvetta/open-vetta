import { useCallback } from "react";
import { TimePicker } from "@/renderer/components/ui/time-picker";
import type { WeeklySchedule } from "./cron-utils";
import { cn } from "@/renderer/lib/utils";

interface WeeklyModeProps {
	schedule: WeeklySchedule;
	onChange: (schedule: WeeklySchedule) => void;
}

const WEEKDAYS = [
	{ value: 1, label: "周一" },
	{ value: 2, label: "周二" },
	{ value: 3, label: "周三" },
	{ value: 4, label: "周四" },
	{ value: 5, label: "周五" },
	{ value: 6, label: "周六" },
	{ value: 0, label: "周日" },
];

interface WeekdayChipProps {
	value: number;
	label: string;
	selected: boolean;
	onToggle: (value: number) => void;
}

function WeekdayChip({ value, label, selected, onToggle }: WeekdayChipProps): JSX.Element {
	return (
		<button
			type="button"
			onClick={() => onToggle(value)}
			className={cn(
				"flex h-8 min-w-[2.5rem] shrink-0 items-center justify-center rounded-md px-2 text-sm font-medium transition-colors",
				selected
					? "bg-[var(--accent)] text-white"
					: "bg-[var(--surface-raised)] text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-[var(--text-1)]",
			)}
		>
			{label}
		</button>
	);
}

export function WeeklyMode({ schedule, onChange }: WeeklyModeProps): JSX.Element {
	const handleToggle = useCallback(
		(value: number) => {
			const next = new Set(schedule.weekdays);
			if (next.has(value)) {
				// Don't allow deselecting the last weekday
				if (next.size > 1) {
					next.delete(value);
				}
			} else {
				next.add(value);
			}
			onChange({ ...schedule, weekdays: next });
		},
		[schedule, onChange],
	);

	const handleHourChange = useCallback(
		(hour: number) => onChange({ ...schedule, hour }),
		[schedule, onChange],
	);

	const handleMinuteChange = useCallback(
		(minute: number) => onChange({ ...schedule, minute }),
		[schedule, onChange],
	);

	return (
		<div className="flex flex-col gap-3">
			{/* Weekday chips */}
			<div>
				<label className="mb-1.5 block text-sm text-[var(--text-2)]">星期</label>
				<div className="flex flex-wrap gap-1.5">
					{WEEKDAYS.map((day) => (
						<WeekdayChip
							key={day.value}
							value={day.value}
							label={day.label}
							selected={schedule.weekdays.has(day.value)}
							onToggle={handleToggle}
						/>
					))}
				</div>
			</div>

			{/* Time */}
			<div>
				<label className="mb-1.5 block text-sm text-[var(--text-2)]">时间</label>
				<TimePicker
					hour={schedule.hour}
					minute={schedule.minute}
					onHourChange={handleHourChange}
					onMinuteChange={handleMinuteChange}
				/>
			</div>
		</div>
	);
}
