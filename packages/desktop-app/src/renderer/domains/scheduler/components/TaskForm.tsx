import { useState, useEffect, useCallback } from "react";
import { useAtomValue } from "jotai";
import { useScheduledTasks } from "../hooks/useScheduledTasks";
import { Button } from "@shared/components/ui/button";
import {
	Dialog,
	DialogContent,
} from "@shared/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/components/ui/select";
import { projectsAtom } from "@shared/store/atoms";
import type { ExecutionModeOverride, ScheduledTask, SessionExecutionMode } from "@shared/store/atoms";
import { pathBasename } from "@shared/lib/utils";
import {
	type Schedule,
	type ScheduleMode,
	type OnceSchedule,
	type DailySchedule,
	type IntervalSchedule,
	getDefaultOnceSchedule,
	getDefaultDailySchedule,
	getDefaultIntervalSchedule,
	toCronExpression,
	describeSchedule,
	parseCronExpression,
} from "./schedule-picker/cron-utils";

interface TaskFormDialogProps {
	open: boolean;
	task?: ScheduledTask;
	onClose: () => void;
}

function projectName(cwd: string): string {
	return pathBasename(cwd);
}

// ─── Schedule modes (no weekly) ───

type CompactScheduleMode = "once" | "daily" | "interval";

const SCHEDULE_MODES: { key: CompactScheduleMode; label: string }[] = [
	{ key: "once", label: "单次" },
	{ key: "daily", label: "每天" },
	{ key: "interval", label: "间隔" },
];

function getDefaultSchedule(mode: CompactScheduleMode): Schedule {
	switch (mode) {
		case "once": return getDefaultOnceSchedule();
		case "daily": return getDefaultDailySchedule();
		case "interval": return getDefaultIntervalSchedule();
	}
}

// ─── Inline schedule editors ───

function OnceEditor({ schedule, onChange }: { schedule: OnceSchedule; onChange: (s: OnceSchedule) => void }) {
	const value = `${schedule.year}-${String(schedule.month).padStart(2, "0")}-${String(schedule.day).padStart(2, "0")}T${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;

	return (
		<input
			type="datetime-local"
			value={value}
			onChange={(e) => {
				const d = new Date(e.target.value);
				if (Number.isNaN(d.getTime())) return;
				onChange({
					...schedule,
					year: d.getFullYear(),
					month: d.getMonth() + 1,
					day: d.getDate(),
					hour: d.getHours(),
					minute: d.getMinutes(),
				});
			}}
			className="h-9 rounded-lg border-none bg-muted px-3 text-sm text-foreground focus:outline-none [color-scheme:dark]"
		/>
	);
}

function DailyEditor({ schedule, onChange }: { schedule: DailySchedule; onChange: (s: DailySchedule) => void }) {
	const timeValue = `${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;

	return (
		<input
			type="time"
			value={timeValue}
			onChange={(e) => {
				const [h, m] = e.target.value.split(":").map(Number);
				if (h != null && m != null) onChange({ ...schedule, hour: h, minute: m });
			}}
			className="h-9 rounded-lg border-none bg-muted px-3 text-sm text-foreground focus:outline-none [color-scheme:dark]"
		/>
	);
}

function IntervalEditor({ schedule, onChange }: { schedule: IntervalSchedule; onChange: (s: IntervalSchedule) => void }) {
	const [unit, setUnit] = useState<"hours" | "days">(() =>
		schedule.intervalHours >= 24 && schedule.intervalHours % 24 === 0 ? "days" : "hours",
	);
	const displayValue = unit === "days" ? schedule.intervalHours / 24 : schedule.intervalHours;

	return (
		<div className="flex items-center gap-2">
			<span className="text-sm text-muted-foreground">每隔</span>
			<input
				type="number"
				value={displayValue}
				min={1}
				onChange={(e) => {
					const n = Number.parseInt(e.target.value, 10);
					if (!Number.isNaN(n) && n >= 1) {
						onChange({ ...schedule, intervalHours: unit === "days" ? n * 24 : n });
					}
				}}
				className="h-9 w-16 rounded-lg border-none bg-muted px-2 text-center text-sm text-foreground focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
			/>
			<select
				value={unit}
				onChange={(e) => {
					const newUnit = e.target.value as "hours" | "days";
					setUnit(newUnit);
					// Convert value
					if (newUnit === "days") {
						onChange({ ...schedule, intervalHours: Math.max(1, Math.round(schedule.intervalHours / 24)) * 24 });
					} else {
						onChange({ ...schedule, intervalHours: Math.max(1, schedule.intervalHours) });
					}
				}}
				className="h-9 rounded-lg border-none bg-muted px-2 pr-6 text-sm text-foreground focus:outline-none"
			>
				<option value="hours">小时</option>
				<option value="days">天</option>
			</select>
		</div>
	);
}

// ─── Main component ───

export function TaskFormDialog({ open, task, onClose }: TaskFormDialogProps): JSX.Element {
	const { createTask, updateTask } = useScheduledTasks();
	const projects = useAtomValue(projectsAtom);
	const [name, setName] = useState("");
	const [cwd, setCwd] = useState("");
	const [prompt, setPrompt] = useState("");
	const [schedule, setSchedule] = useState<Schedule>(getDefaultDailySchedule());
	const [isOnce, setIsOnce] = useState(false);
	const [executionMode, setExecutionMode] = useState<ExecutionModeOverride>("full-access");
	const [defaultExecutionMode, setDefaultExecutionMode] = useState<SessionExecutionMode>("full-access");
	const [sandboxUnavailableReason, setSandboxUnavailableReason] = useState<string | null>(null);
	const [projectPopoverOpen, setProjectPopoverOpen] = useState(false);
	const [schedulePopoverOpen, setSchedulePopoverOpen] = useState(false);

	useEffect(() => {
		if (open) {
			setName(task?.name ?? "");
			setCwd(task?.cwd ?? projects[0]?.cwd ?? "");
			setPrompt(task?.prompt ?? "");
			setIsOnce(task?.isOnce ?? false);
			setExecutionMode(task?.executionMode ?? "full-access");

			if (task?.cron) {
				const parsed = parseCronExpression(task.cron, task.isOnce);
				if (parsed && parsed.mode !== "weekly") {
					setSchedule(parsed);
				} else {
					setSchedule(getDefaultDailySchedule());
				}
			} else {
				setSchedule(getDefaultDailySchedule());
			}

			void window.vetta.config.get().then((config) => {
				setDefaultExecutionMode(config.defaultExecutionMode ?? "full-access");
				const capability = config.sandbox ?? config.linuxSandbox;
				if (capability?.status === "unavailable") {
					const reason = capability.reason ?? "unknown_error";
					const platform = "platform" in capability ? capability.platform : "linux";
					setSandboxUnavailableReason(`${platform} 沙盒不可用：${reason}`);
					return;
				}
				setSandboxUnavailableReason(null);
			});
		}
	}, [open, task, projects]);

	const mode = schedule.mode === "weekly" ? "daily" : schedule.mode as CompactScheduleMode;

	const handleModeChange = useCallback((newMode: CompactScheduleMode) => {
		const s = getDefaultSchedule(newMode);
		setSchedule(s);
		setIsOnce(newMode === "once");
	}, []);

	const handleScheduleChange = useCallback((s: Schedule) => {
		setSchedule(s);
		setIsOnce(s.mode === "once");
	}, []);

	const canSubmit = name.trim() && prompt.trim() && cwd;

	const handleSubmit = async () => {
		if (!canSubmit) return;
		const cron = toCronExpression(schedule);
		const taskData = { name, prompt, cron, isOnce, enabled: true, cwd, executionMode };

		if (task) {
			await updateTask(task.id, taskData);
		} else {
			await createTask(taskData);
		}
		onClose();
	};

	const scheduleLabel = describeSchedule(schedule);

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent
				className="flex max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
				showCloseButton={false}
			>
				{/* ─── Header: title input ─── */}
				<div className="px-6 pt-5 pb-2">
					<input
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						className="w-full border-none bg-transparent text-lg font-semibold text-foreground placeholder:text-muted-foreground/50 focus:outline-none! focus-visible:outline-none! focus:shadow-none! focus-visible:shadow-none!"
						placeholder={task ? "任务名称" : "新建任务"}
						autoFocus
					/>
				</div>

				{/* ─── Body: prompt textarea ─── */}
				<div className="flex-1 overflow-y-auto px-6 pb-4">
					<textarea
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						className="min-h-[120px] w-full resize-y border-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
						placeholder="输入提示词..."
						rows={5}
					/>
				</div>

				{/* ─── Schedule section ─── */}
				{schedulePopoverOpen && (
					<div className="border-t border-border px-6 py-4">
						<div className="mb-3 flex items-center justify-between">
							<span className="text-sm font-medium text-foreground">调度</span>
							<div className="flex gap-1">
								{SCHEDULE_MODES.map((m) => (
									<button
										key={m.key}
										type="button"
										onClick={() => handleModeChange(m.key)}
										className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
											mode === m.key
												? "text-foreground"
												: "text-muted-foreground/50 hover:text-muted-foreground"
										}`}
									>
										{m.label}
									</button>
								))}
							</div>
						</div>

						{mode === "once" && (
							<OnceEditor
								schedule={schedule as OnceSchedule}
								onChange={handleScheduleChange}
							/>
						)}
						{mode === "daily" && (
							<DailyEditor
								schedule={schedule as DailySchedule}
								onChange={handleScheduleChange}
							/>
						)}
						{mode === "interval" && (
							<IntervalEditor
								schedule={schedule as IntervalSchedule}
								onChange={handleScheduleChange}
							/>
						)}
					</div>
				)}

				{/* ─── Footer bar ─── */}
				<div className="flex items-center gap-2 border-t border-border px-5 py-3">
					{/* Project selector */}
					<Popover open={projectPopoverOpen} onOpenChange={setProjectPopoverOpen}>
						<PopoverTrigger asChild>
							<button
								type="button"
								className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
							>
								<span className="icon-[mdi--folder-outline] text-[14px]" />
								<span>{cwd ? projectName(cwd) : "选择项目"}</span>
								<span className="icon-[mdi--chevron-down] text-[14px]" />
							</button>
						</PopoverTrigger>
						<PopoverContent align="start" className="w-48 p-1">
							{projects.map((p) => (
								<button
									key={p.cwd}
									type="button"
									onClick={() => { setCwd(p.cwd); setProjectPopoverOpen(false); }}
									className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
										cwd === p.cwd
											? "bg-accent text-foreground"
											: "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
									}`}
								>
									<span className="icon-[mdi--folder-outline] text-[14px]" />
									{projectName(p.cwd)}
								</button>
							))}
						</PopoverContent>
					</Popover>

					{/* Schedule toggle */}
					<button
						type="button"
						onClick={() => setSchedulePopoverOpen(!schedulePopoverOpen)}
						className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
					>
						<span className="icon-[mdi--clock-outline] text-[14px]" />
						<span>{scheduleLabel}</span>
						<span className={`icon-[mdi--chevron-${schedulePopoverOpen ? "up" : "down"}] text-[14px]`} />
					</button>

					<Select value={executionMode} onValueChange={(value) => setExecutionMode(value as ExecutionModeOverride)}>
						<SelectTrigger className="h-8 w-44 border-border/70 bg-background/50 text-[12px] text-muted-foreground">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="inherit" className="text-[12px]">
								跟随默认（{defaultExecutionMode === "sandbox" ? "沙盒" : "完全访问"}）
							</SelectItem>
							<SelectItem value="full-access" className="text-[12px]">
								完全访问
							</SelectItem>
							<SelectItem
								value="sandbox"
								className="text-[12px]"
								disabled={Boolean(sandboxUnavailableReason)}
								title={sandboxUnavailableReason ?? undefined}
							>
								使用沙盒
							</SelectItem>
						</SelectContent>
					</Select>

					{/* Spacer */}
					<div className="flex-1" />

					{/* Actions */}
					<button
						type="button"
						onClick={onClose}
						className="px-3 py-1.5 text-sm text-muted-foreground/50 transition-colors hover:text-muted-foreground"
					>
						取消
					</button>
					<Button
						onClick={handleSubmit}
						disabled={!canSubmit}
						className="rounded-full px-5"
					>
						{task ? "保存" : "创建"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
