import { useCallback } from "react";
import { TimePicker } from "@/renderer/components/ui/time-picker";
import type { DailySchedule } from "./cron-utils";

interface DailyModeProps {
	schedule: DailySchedule;
	onChange: (schedule: DailySchedule) => void;
}

export function DailyMode({ schedule, onChange }: DailyModeProps): JSX.Element {
	const handleHourChange = useCallback(
		(hour: number) => onChange({ ...schedule, hour }),
		[schedule, onChange],
	);

	const handleMinuteChange = useCallback(
		(minute: number) => onChange({ ...schedule, minute }),
		[schedule, onChange],
	);

	return (
		<div>
			<label className="mb-1.5 block text-sm text-[var(--text-2)]">时间</label>
			<TimePicker
				hour={schedule.hour}
				minute={schedule.minute}
				onHourChange={handleHourChange}
				onMinuteChange={handleMinuteChange}
			/>
		</div>
	);
}
