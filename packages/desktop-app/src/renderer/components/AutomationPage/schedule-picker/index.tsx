import { useState, useCallback } from "react";
import { SegmentedControl } from "@/renderer/components/ui/segmented-control";
import {
	type Schedule,
	type ScheduleMode,
	type OnceSchedule,
	type DailySchedule,
	type WeeklySchedule,
	type IntervalSchedule,
	getDefaultOnceSchedule,
	getDefaultDailySchedule,
	getDefaultWeeklySchedule,
	getDefaultIntervalSchedule,
	toCronExpression,
	describeSchedule,
	parseCronExpression,
} from "./cron-utils";
import { OnceMode } from "./once-mode";
import { DailyMode } from "./daily-mode";
import { WeeklyMode } from "./weekly-mode";
import { IntervalMode } from "./interval-mode";

interface SchedulePickerProps {
	/** Current cron expression */
	value: string;
	/** Whether this is a one-time task */
	isOnce: boolean;
	/** Called when cron expression changes */
	onChange: (cron: string) => void;
	/** Called when isOnce changes */
	onIsOnceChange: (isOnce: boolean) => void;
}

const MODE_ITEMS = [
	{ key: "once" as const, label: "单次" },
	{ key: "daily" as const, label: "每天" },
	{ key: "weekly" as const, label: "每周" },
	{ key: "interval" as const, label: "间隔" },
];

/** Get the mode from a parsed schedule */
function getMode(schedule: Schedule): ScheduleMode {
	return schedule.mode;
}

/** Get default schedule for a given mode */
function getDefaultSchedule(m: ScheduleMode): Schedule {
	switch (m) {
		case "once": return getDefaultOnceSchedule();
		case "daily": return getDefaultDailySchedule();
		case "weekly": return getDefaultWeeklySchedule();
		case "interval": return getDefaultIntervalSchedule();
	}
}

export function SchedulePicker({
	value,
	isOnce,
	onChange,
	onIsOnceChange,
}: SchedulePickerProps) {
	// Parse the incoming cron expression to reconstruct UI state
	const initialSchedule = value
		? parseCronExpression(value, isOnce) ?? getDefaultSchedule(isOnce ? "once" : "daily")
		: getDefaultSchedule(isOnce ? "once" : "daily");

	const initialMode = getMode(initialSchedule);

	const [mode, setMode] = useState<ScheduleMode>(initialMode);
	const [schedule, setSchedule] = useState<Schedule>(initialSchedule);

	const handleModeChange = useCallback(
		(newMode: ScheduleMode) => {
			setMode(newMode);
			setSchedule(getDefaultSchedule(newMode));
			const newCron = toCronExpression(getDefaultSchedule(newMode));
			onChange(newCron);
			onIsOnceChange(newMode === "once");
		},
		[getDefaultSchedule, onChange, onIsOnceChange],
	);

	const handleScheduleChange = useCallback(
		(newSchedule: Schedule) => {
			setSchedule(newSchedule);
			onChange(toCronExpression(newSchedule));
			onIsOnceChange(newSchedule.mode === "once");
		},
		[onChange, onIsOnceChange],
	);

	return (
		<div className="flex flex-col gap-3">
			{/* Mode selector */}
			<SegmentedControl
				items={MODE_ITEMS}
				value={mode}
				onChange={handleModeChange}
			/>

			{/* Mode-specific content */}
			<div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
				{mode === "once" && (
					<OnceMode
						schedule={schedule as OnceSchedule}
						onChange={handleScheduleChange}
					/>
				)}
				{mode === "daily" && (
					<DailyMode
						schedule={schedule as DailySchedule}
						onChange={handleScheduleChange}
					/>
				)}
				{mode === "weekly" && (
					<WeeklyMode
						schedule={schedule as WeeklySchedule}
						onChange={handleScheduleChange}
					/>
				)}
				{mode === "interval" && (
					<IntervalMode
						schedule={schedule as IntervalSchedule}
						onChange={handleScheduleChange}
					/>
				)}
			</div>

			{/* Preview */}
			<div className="flex flex-col gap-1">
				<p className="text-xs text-[var(--text-3)]">
					{describeSchedule(schedule)}
				</p>
				<p className="rounded bg-[var(--surface)] px-2 py-1 font-mono text-xs text-[var(--text-3)]">
					{value}
				</p>
			</div>
		</div>
	);
}
