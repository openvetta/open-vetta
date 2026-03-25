import { useCallback } from "react";
import { Calendar } from "@shared/components/ui/calendar";
import { TimePicker } from "@shared/components/ui/time-picker";
import type { OnceSchedule } from "./cron-utils";

interface OnceModeProps {
	schedule: OnceSchedule;
	onChange: (schedule: OnceSchedule) => void;
}

export function OnceMode({ schedule, onChange }: OnceModeProps): JSX.Element {
	const handleDateChange = useCallback(
		(date: Date | undefined) => {
			if (!date) return;
			onChange({
				...schedule,
				year: date.getFullYear(),
				month: date.getMonth() + 1,
				day: date.getDate(),
			});
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

	// Build Date for calendar — use the schedule's date, defaulting to today if not set
	const selectedDate = new Date(schedule.year, schedule.month - 1, schedule.day);

	// Disable dates in the past
	const disabledDays = {
		before: new Date(),
	};

	return (
		<div className="flex flex-col gap-3">
			{/* Date selection */}
			<div>
				<label className="mb-1.5 block text-sm text-[var(--text-2)]">日期</label>
				<div className="w-fit">
					<Calendar
						mode="single"
						selected={selectedDate}
						onSelect={handleDateChange}
						disabled={disabledDays}
						className="rounded-md border border-[var(--border)]"
					/>
				</div>
			</div>

			{/* Time selection */}
			<div>
				<label className="mb-1.5 block text-sm text-[var(--text-2)]">时间</label>
				<TimePicker
					hour={schedule.hour}
					minute={schedule.minute}
					onHourChange={handleHourChange}
					onMinuteChange={handleMinuteChange}
				/>
			</div>

			{/* Info notice */}
			<div className="flex items-center gap-1.5 rounded-md bg-[var(--surface-raised)] px-3 py-2">
				<span className="icon-[mdi--information-outline] text-sm text-[var(--text-3)]" />
				<p className="text-xs text-[var(--text-3)]">执行后自动禁用该任务</p>
			</div>
		</div>
	);
}
