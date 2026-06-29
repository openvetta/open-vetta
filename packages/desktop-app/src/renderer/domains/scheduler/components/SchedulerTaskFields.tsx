import { SkillPromptArea } from "@domains/chat/components/SkillPromptArea";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
import { ModelSelect } from "@shared/components/ModelSelect";
import {
	defaultConversationCwdAtom,
	getProjectDisplayName,
	projectsAtom,
} from "@shared/store/atoms";
import type {
	ExecutionModeOverride,
	SelectedSkill,
	SessionExecutionMode,
} from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	describeSchedule,
	getDefaultDailySchedule,
	getDefaultIntervalSchedule,
	getDefaultOnceSchedule,
	parseCronExpression,
	toCronExpression,
	type DailySchedule,
	type IntervalSchedule,
	type OnceSchedule,
	type Schedule,
} from "./schedule-picker/cron-utils";

export interface SchedulerTaskDraft {
	name?: string;
	prompt?: string;
	cron?: string;
	isOnce?: boolean;
	enabled?: boolean;
	cwd?: string;
	modelKey?: string | null;
	executionMode?: ExecutionModeOverride;
	skill?: SelectedSkill | null;
}

interface SchedulerTaskFieldsProps {
	value: SchedulerTaskDraft;
	onChange: (value: SchedulerTaskDraft) => void;
	namePlaceholder?: string;
	showEnabled?: boolean;
	showWorkDirSelector?: boolean;
	promptMinHeight?: number;
}

type CompactScheduleMode = "once" | "daily" | "interval";

function getDefaultSchedule(mode: CompactScheduleMode): Schedule {
	switch (mode) {
		case "once":
			return getDefaultOnceSchedule();
		case "daily":
			return getDefaultDailySchedule();
		case "interval":
			return getDefaultIntervalSchedule();
	}
}

function OnceEditor({
	schedule,
	onChange,
}: {
	schedule: OnceSchedule;
	onChange: (schedule: OnceSchedule) => void;
}): JSX.Element {
	const value = `${schedule.year}-${String(schedule.month).padStart(2, "0")}-${String(schedule.day).padStart(2, "0")}T${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;

	return (
		<input
			type="datetime-local"
			value={value}
			onChange={(event) => {
				const date = new Date(event.target.value);
				if (Number.isNaN(date.getTime())) return;
				onChange({
					...schedule,
					year: date.getFullYear(),
					month: date.getMonth() + 1,
					day: date.getDate(),
					hour: date.getHours(),
					minute: date.getMinutes(),
				});
			}}
			className="h-9 rounded-lg border-none bg-muted px-3 text-sm text-foreground focus:outline-none [color-scheme:dark]"
		/>
	);
}

function DailyEditor({
	schedule,
	onChange,
}: {
	schedule: DailySchedule;
	onChange: (schedule: DailySchedule) => void;
}): JSX.Element {
	const timeValue = `${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;

	return (
		<input
			type="time"
			value={timeValue}
			onChange={(event) => {
				const [hour, minute] = event.target.value.split(":").map(Number);
				if (hour != null && minute != null) onChange({ ...schedule, hour, minute });
			}}
			className="h-9 rounded-lg border-none bg-muted px-3 text-sm text-foreground focus:outline-none [color-scheme:dark]"
		/>
	);
}

function IntervalEditor({
	schedule,
	onChange,
}: {
	schedule: IntervalSchedule;
	onChange: (schedule: IntervalSchedule) => void;
}): JSX.Element {
	const { t } = useTranslation("automation");
	const [unit, setUnit] = useState<"hours" | "days">(() =>
		schedule.intervalHours >= 24 && schedule.intervalHours % 24 === 0 ? "days" : "hours",
	);
	const displayValue = unit === "days" ? schedule.intervalHours / 24 : schedule.intervalHours;

	return (
		<div className="flex items-center gap-2">
			<span className="text-sm text-muted-foreground">{t("form.every")}</span>
			<input
				type="number"
				value={displayValue}
				min={1}
				onChange={(event) => {
					const value = Number.parseInt(event.target.value, 10);
					if (!Number.isNaN(value) && value >= 1) {
						onChange({ ...schedule, intervalHours: unit === "days" ? value * 24 : value });
					}
				}}
				className="h-9 w-16 rounded-lg border-none bg-muted px-2 text-center text-sm text-foreground focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
			/>
			<select
				value={unit}
				onChange={(event) => {
					const nextUnit = event.target.value as "hours" | "days";
					setUnit(nextUnit);
					if (nextUnit === "days") {
						onChange({ ...schedule, intervalHours: Math.max(1, Math.round(schedule.intervalHours / 24)) * 24 });
					} else {
						onChange({ ...schedule, intervalHours: Math.max(1, schedule.intervalHours) });
					}
				}}
				className="h-9 rounded-lg border-none bg-muted px-2 pr-6 text-sm text-foreground focus:outline-none"
			>
				<option value="hours">{t("form.unitHours")}</option>
				<option value="days">{t("form.unitDays")}</option>
			</select>
		</div>
	);
}

export function SchedulerTaskFields({
	value,
	onChange,
	namePlaceholder,
	showEnabled = false,
	showWorkDirSelector = true,
	promptMinHeight = 140,
}: SchedulerTaskFieldsProps): JSX.Element {
	const { t } = useTranslation("automation");
	const namePlaceholderText = namePlaceholder ?? t("form.namePlaceholder");
	const scheduleModes: { key: CompactScheduleMode; label: string }[] = [
		{ key: "once", label: t("scheduleMode.once") },
		{ key: "daily", label: t("scheduleMode.daily") },
		{ key: "interval", label: t("scheduleMode.interval") },
	];
	const projects = useAtomValue(projectsAtom);
	const defaultCwd = useAtomValue(defaultConversationCwdAtom);
	const projectName = useCallback((cwd: string) => getProjectDisplayName(cwd, defaultCwd), [defaultCwd]);
	const [schedule, setSchedule] = useState<Schedule>(() =>
		parseCronExpression(value.cron ?? "", value.isOnce ?? false) ?? getDefaultDailySchedule(),
	);
	const [defaultExecutionMode, setDefaultExecutionMode] = useState<SessionExecutionMode>("full-access");
	const [sandboxUnavailableReason, setSandboxUnavailableReason] = useState<string | null>(null);
	const [workDirPopoverOpen, setWorkDirPopoverOpen] = useState(false);
	const [schedulePopoverOpen, setSchedulePopoverOpen] = useState(false);
	const [executionPopoverOpen, setExecutionPopoverOpen] = useState(false);

	const set = <Key extends keyof SchedulerTaskDraft>(
		key: Key,
		nextValue: SchedulerTaskDraft[Key],
	): void => {
		onChange({ ...value, [key]: nextValue });
	};

	useEffect(() => {
		const parsed = parseCronExpression(value.cron ?? "", value.isOnce ?? false);
		if (parsed && parsed.mode !== "weekly") setSchedule(parsed);
	}, [value.cron, value.isOnce]);

	useEffect(() => {
		void window.vetta.config.get().then((config) => {
			setDefaultExecutionMode(config.defaultExecutionMode ?? "full-access");
			const capability = config.sandbox ?? config.linuxSandbox;
			if (capability?.status === "unavailable") {
				const reason = capability.reason ?? "unknown_error";
				const platform = "platform" in capability ? capability.platform : "linux";
				setSandboxUnavailableReason(t("form.sandboxUnavailable", { platform, reason }));
				return;
			}
			setSandboxUnavailableReason(null);
		});
	}, [t]);

	const workDirOptions = useMemo(() => {
		const seen = new Set<string>();
		const options: { cwd: string; name: string }[] = [];
		const add = (cwd: string | undefined, name?: string) => {
			if (!cwd || seen.has(cwd)) return;
			seen.add(cwd);
			options.push({ cwd, name: name ?? projectName(cwd) });
		};
		add(defaultCwd, t("form.conversation"));
		add(value.cwd);
		for (const project of projects) add(project.cwd, project.name);
		return options;
	}, [defaultCwd, projects, projectName, value.cwd, t]);

	const mode = schedule.mode === "weekly" ? "daily" : schedule.mode as CompactScheduleMode;
	const scheduleLabel = describeSchedule(schedule, t);
	const executionMode = value.executionMode ?? "inherit";
	const executionLabel =
		executionMode === "sandbox"
			? t("form.useSandbox")
			: executionMode === "full-access"
				? t("form.fullAccess")
				: t("form.inherit", {
						mode: defaultExecutionMode === "sandbox" ? t("form.sandbox") : t("form.fullAccess"),
					});
	const executionIcon =
		executionMode === "sandbox"
			? "icon-[mdi--shield-lock-outline]"
			: executionMode === "full-access"
				? "icon-[mdi--shield-check-outline]"
				: "icon-[mdi--shield-outline]";

	const handleScheduleChange = (nextSchedule: Schedule): void => {
		setSchedule(nextSchedule);
		onChange({
			...value,
			cron: toCronExpression(nextSchedule),
			isOnce: nextSchedule.mode === "once",
		});
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3">
				<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/20">
					<span className="icon-[mdi--clock-time-eight-outline] h-4 w-4 text-primary" />
				</div>
				<input
					type="text"
					value={value.name ?? ""}
					onChange={(event) => set("name", event.target.value)}
					className="w-full border-none bg-transparent text-[15px] font-semibold text-foreground placeholder:text-muted-foreground/40 focus:outline-none! focus-visible:outline-none! focus:shadow-none! focus-visible:shadow-none!"
					placeholder={namePlaceholderText}
				/>
			</div>

			<SkillPromptArea
				prompt={value.prompt ?? ""}
				onPromptChange={(prompt) => set("prompt", prompt)}
				skill={value.skill ?? null}
				onSkillChange={(skill) => set("skill", skill)}
				placeholder={t("form.promptPlaceholder")}
				minHeight={promptMinHeight}
				cwd={value.cwd}
			/>

			<div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 bg-background/30 p-3">
				{showWorkDirSelector && (
					<Popover open={workDirPopoverOpen} onOpenChange={setWorkDirPopoverOpen}>
						<PopoverTrigger asChild>
							<button
								type="button"
								className="flex h-8 items-center gap-1.5 rounded-lg border border-border/50 bg-card/40 px-2.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-card/70 hover:text-foreground"
							>
								<span className="icon-[mdi--folder-outline] h-3.5 w-3.5" />
								<span className="max-w-[140px] truncate">{value.cwd ? projectName(value.cwd) : t("form.selectWorkDir")}</span>
								<span className="icon-[mdi--chevron-down] h-3.5 w-3.5 opacity-60" />
							</button>
						</PopoverTrigger>
						<PopoverContent align="start" className="w-56 p-1">
							{workDirOptions.map((option) => (
								<button
									key={option.cwd}
									type="button"
									onClick={() => {
										set("cwd", option.cwd);
										setWorkDirPopoverOpen(false);
									}}
									className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] transition-colors ${
										value.cwd === option.cwd
											? "bg-primary/10 text-primary"
											: "text-foreground hover:bg-accent/50"
									}`}
								>
									<span className="icon-[mdi--folder-outline] h-3.5 w-3.5" />
									<span className="truncate">{option.name}</span>
								</button>
							))}
						</PopoverContent>
					</Popover>
				)}

				<Popover open={schedulePopoverOpen} onOpenChange={setSchedulePopoverOpen}>
					<PopoverTrigger asChild>
						<button
							type="button"
							className="flex h-8 items-center gap-1.5 rounded-lg border border-border/50 bg-card/40 px-2.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-card/70 hover:text-foreground"
						>
							<span className="icon-[mdi--clock-outline] h-3.5 w-3.5" />
							<span className="max-w-[180px] truncate">{scheduleLabel}</span>
							<span className="icon-[mdi--chevron-down] h-3.5 w-3.5 opacity-60" />
						</button>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-72 p-3">
						<div className="mb-2.5 flex gap-1">
							{scheduleModes.map((scheduleMode) => (
								<button
									key={scheduleMode.key}
									type="button"
									onClick={() => handleScheduleChange(getDefaultSchedule(scheduleMode.key))}
									className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
										mode === scheduleMode.key
											? "bg-primary/10 text-primary"
											: "text-muted-foreground/60 hover:bg-accent/50 hover:text-foreground"
									}`}
								>
									{scheduleMode.label}
								</button>
							))}
						</div>
						{mode === "once" && (
							<OnceEditor schedule={schedule as OnceSchedule} onChange={handleScheduleChange} />
						)}
						{mode === "daily" && (
							<DailyEditor schedule={schedule as DailySchedule} onChange={handleScheduleChange} />
						)}
						{mode === "interval" && (
							<IntervalEditor schedule={schedule as IntervalSchedule} onChange={handleScheduleChange} />
						)}
					</PopoverContent>
				</Popover>

				<Popover open={executionPopoverOpen} onOpenChange={setExecutionPopoverOpen}>
					<PopoverTrigger asChild>
						<button
							type="button"
							className="flex h-8 items-center gap-1.5 rounded-lg border border-border/50 bg-card/40 px-2.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-card/70 hover:text-foreground"
						>
							<span className={`${executionIcon} h-3.5 w-3.5`} />
							<span className="max-w-[140px] truncate">{executionLabel}</span>
							<span className="icon-[mdi--chevron-down] h-3.5 w-3.5 opacity-60" />
						</button>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-56 p-1">
						{[
							{ value: "inherit" as const, label: t("form.inherit", { mode: defaultExecutionMode === "sandbox" ? t("form.sandbox") : t("form.fullAccess") }), icon: "icon-[mdi--shield-outline]" },
							{ value: "full-access" as const, label: t("form.fullAccess"), icon: "icon-[mdi--shield-check-outline]" },
							{ value: "sandbox" as const, label: t("form.useSandbox"), icon: "icon-[mdi--shield-lock-outline]", disabled: Boolean(sandboxUnavailableReason) },
						].map((option) => {
							const isSelected = executionMode === option.value;
							return (
								<button
									key={option.value}
									type="button"
									disabled={option.disabled}
									title={option.disabled ? sandboxUnavailableReason ?? undefined : undefined}
									onClick={() => {
										set("executionMode", option.value);
										setExecutionPopoverOpen(false);
									}}
									className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
										isSelected
											? "bg-primary/10 text-primary"
											: "text-foreground hover:bg-accent/50"
									}`}
								>
									<span className={`${option.icon} h-3.5 w-3.5`} />
									<span className="flex-1 truncate text-left">{option.label}</span>
									{isSelected && <span className="icon-[mdi--check] h-3.5 w-3.5" />}
								</button>
							);
						})}
					</PopoverContent>
				</Popover>

				<ModelSelect
					value={value.modelKey ?? null}
					onChange={(key) => set("modelKey", key)}
					placeholder={t("form.modelSelect")}
					triggerClassName="h-8 rounded-lg border-border/50 bg-card/40 px-2.5 text-muted-foreground hover:border-primary/30 hover:bg-card/70 hover:text-foreground"
				/>

				{showEnabled && (
					<button
						type="button"
						onClick={() => set("enabled", !(value.enabled ?? true))}
						className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors ${
							value.enabled ?? true
								? "border-primary/30 bg-primary/10 text-primary"
								: "border-border/50 bg-card/40 text-muted-foreground hover:bg-card/70 hover:text-foreground"
						}`}
					>
						<span className={`${value.enabled ?? true ? "icon-[mdi--toggle-switch]" : "icon-[mdi--toggle-switch-off-outline]"} h-3.5 w-3.5`} />
						<span>{value.enabled ?? true ? t("form.enabled") : t("form.disabled")}</span>
					</button>
				)}
			</div>
		</div>
	);
}
