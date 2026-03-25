/**
 * Cron expression generation and parsing utilities for the schedule picker.
 *
 * Cron format (node-cron): minute hour day-of-month month day-of-week
 * Fields:
 *   minute      (0-59)
 *   hour        (0-23)
 *   day-of-month (1-31)
 *   month       (1-12)
 *   day-of-week (0-6, 0=Sunday)
 */

export type ScheduleMode = "once" | "daily" | "weekly" | "interval";

export interface OnceSchedule {
	mode: "once";
	/** Year as integer, e.g. 2026 */
	year: number;
	/** Month as integer (1-12) */
	month: number;
	/** Day as integer (1-31) */
	day: number;
	/** Hour (0-23) */
	hour: number;
	/** Minute (0-59) */
	minute: number;
}

export interface DailySchedule {
	mode: "daily";
	/** Hour (0-23) */
	hour: number;
	/** Minute (0-59) */
	minute: number;
}

export interface WeeklySchedule {
	mode: "weekly";
	/** Set of weekdays (0=Sunday, 1=Monday, ..., 6=Saturday) */
	weekdays: Set<number>;
	/** Hour (0-23) */
	hour: number;
	/** Minute (0-59) */
	minute: number;
}

export interface IntervalSchedule {
	mode: "interval";
	/** Interval value in hours */
	intervalHours: number;
}

export type Schedule = OnceSchedule | DailySchedule | WeeklySchedule | IntervalSchedule;

/** Human-readable description of a schedule */
export function describeSchedule(schedule: Schedule): string {
	switch (schedule.mode) {
		case "once": {
			const date = new Date(schedule.year, schedule.month - 1, schedule.day);
			const dateStr = date.toLocaleDateString("zh-CN", {
				year: "numeric",
				month: "long",
				day: "numeric",
			});
			const timeStr = `${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
			return `${dateStr} ${timeStr} 执行一次`;
		}
		case "daily": {
			const timeStr = `${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
			return `每天 ${timeStr} 执行`;
		}
		case "weekly": {
			const weekdayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
			const sortedDays = [...schedule.weekdays].sort((a, b) => a - b);
			const dayStr =
				sortedDays.length === 1 ? weekdayNames[sortedDays[0]] : sortedDays.map((d) => weekdayNames[d]).join("、");
			const timeStr = `${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
			return `每${dayStr} ${timeStr} 执行`;
		}
		case "interval": {
			if (schedule.intervalHours === 1) return "每隔 1 小时执行";
			return `每隔 ${schedule.intervalHours} 小时执行`;
		}
	}
}

/** Generate cron expression string from schedule */
export function toCronExpression(schedule: Schedule): string {
	switch (schedule.mode) {
		case "once":
			// node-cron does not support year field.
			// We use a 6-field cron: minute hour day month day-of-week
			// The task will fire once and then be disabled via isOnce flag.
			return `${schedule.minute} ${schedule.hour} ${schedule.day} ${schedule.month} *`;
		case "daily":
			return `${schedule.minute} ${schedule.hour} * * *`;
		case "weekly": {
			const sortedDays = [...schedule.weekdays].sort((a, b) => a - b).join(",");
			return `${schedule.minute} ${schedule.hour} * * ${sortedDays}`;
		}
		case "interval":
			// Every N hours at minute 0
			return `0 */${schedule.intervalHours} * * *`;
	}
}

/** Get default schedule values for each mode */
export function getDefaultOnceSchedule(): OnceSchedule {
	const now = new Date();
	// Default to next hour (minimum non-past time)
	const next = new Date(now);
	next.setMinutes(next.getMinutes() + 1);
	next.setSeconds(0);
	next.setMilliseconds(0);
	// If we're at minute 59, go to next hour
	if (next.getMinutes() === 0 && now.getMinutes() > 0) {
		// Already set to next hour correctly
	}
	return {
		mode: "once",
		year: next.getFullYear(),
		month: next.getMonth() + 1,
		day: next.getDate(),
		hour: next.getHours(),
		minute: next.getMinutes(),
	};
}

export function getDefaultDailySchedule(): DailySchedule {
	return { mode: "daily", hour: 9, minute: 0 };
}

export function getDefaultWeeklySchedule(): WeeklySchedule {
	return { mode: "weekly", weekdays: new Set([1]), hour: 9, minute: 0 };
}

export function getDefaultIntervalSchedule(): IntervalSchedule {
	// Default to 2 hours so "custom" mode is active on first click,
	// allowing users to enter any interval value.
	return { mode: "interval", intervalHours: 2 };
}
