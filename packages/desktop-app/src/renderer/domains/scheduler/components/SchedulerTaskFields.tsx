import { SkillPromptArea } from "@domains/chat/components/SkillPromptArea";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
import {
	defaultConversationCwdAtom,
	getProjectDisplayName,
	projectsAtom,
	remoteProvidersAtom,
} from "@shared/store/atoms";
import type {
	ExecutionModeOverride,
	SelectedSkill,
	SessionExecutionMode,
} from "@shared/store/atoms";
import type { ModelsConfigData } from "@preload/api";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
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
	promptMinHeight?: number;
}

type CompactScheduleMode = "once" | "daily" | "interval";

const SCHEDULE_MODES: { key: CompactScheduleMode; label: string }[] = [
	{ key: "once", label: "单次" },
	{ key: "daily", label: "每天" },
	{ key: "interval", label: "间隔" },
];

interface ModelOption {
	provider: string;
	modelId: string;
	displayName: string;
	key: string;
	remote?: boolean;
	tags?: string[];
	supportsImage?: boolean;
}

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

function flattenModels(config: ModelsConfigData, remote?: boolean): ModelOption[] {
	const result: ModelOption[] = [];
	for (const [provider, providerConfig] of Object.entries(config.providers)) {
		for (const model of providerConfig.models ?? []) {
			const raw = model as Record<string, unknown>;
			result.push({
				provider,
				modelId: model.id,
				displayName: model.name || model.id,
				key: `${provider}/${model.id}`,
				remote,
				tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : undefined,
				supportsImage: model.input?.includes("image") ?? false,
			});
		}
	}
	return result;
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
				<option value="hours">小时</option>
				<option value="days">天</option>
			</select>
		</div>
	);
}

export function SchedulerTaskFields({
	value,
	onChange,
	namePlaceholder = "任务名称",
	showEnabled = false,
	promptMinHeight = 140,
}: SchedulerTaskFieldsProps): JSX.Element {
	const projects = useAtomValue(projectsAtom);
	const remoteProviders = useAtomValue(remoteProvidersAtom);
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
	const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
	const [modelsConfig, setModelsConfig] = useState<ModelsConfigData | null>(null);

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
				setSandboxUnavailableReason(`${platform} 沙盒不可用：${reason}`);
				return;
			}
			setSandboxUnavailableReason(null);
		});

		void window.vetta.models.get().then(setModelsConfig);
	}, []);

	const models = useMemo(() => {
		const localModels = modelsConfig ? flattenModels(modelsConfig) : [];
		const remoteModels = Object.keys(remoteProviders).length > 0
			? flattenModels({ providers: remoteProviders as ModelsConfigData["providers"] }, true)
			: [];
		const localKeys = new Set(localModels.map((model) => model.key));
		return [...localModels, ...remoteModels.filter((model) => !localKeys.has(model.key))];
	}, [modelsConfig, remoteProviders]);

	const workDirOptions = useMemo(() => {
		const seen = new Set<string>();
		const options: { cwd: string; name: string }[] = [];
		const add = (cwd: string | undefined, name?: string) => {
			if (!cwd || seen.has(cwd)) return;
			seen.add(cwd);
			options.push({ cwd, name: name ?? projectName(cwd) });
		};
		add(defaultCwd, "对话");
		add(value.cwd);
		for (const project of projects) add(project.cwd, project.name);
		return options;
	}, [defaultCwd, projects, projectName, value.cwd]);

	const groupedModels = useMemo(() => {
		const map = new Map<string, ModelOption[]>();
		for (const model of models) {
			const list = map.get(model.provider) ?? [];
			list.push(model);
			map.set(model.provider, list);
		}
		return map;
	}, [models]);

	const mode = schedule.mode === "weekly" ? "daily" : schedule.mode as CompactScheduleMode;
	const selectedModel = models.find((model) => model.key === value.modelKey);
	const scheduleLabel = describeSchedule(schedule);
	const executionMode = value.executionMode ?? "inherit";
	const executionLabel =
		executionMode === "sandbox"
			? "使用沙盒"
			: executionMode === "full-access"
				? "完全访问"
				: `跟随默认（${defaultExecutionMode === "sandbox" ? "沙盒" : "完全访问"}）`;
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
					placeholder={namePlaceholder}
				/>
			</div>

			<SkillPromptArea
				prompt={value.prompt ?? ""}
				onPromptChange={(prompt) => set("prompt", prompt)}
				skill={value.skill ?? null}
				onSkillChange={(skill) => set("skill", skill)}
				placeholder="输入提示词...使用 / 唤出技能/场景"
				minHeight={promptMinHeight}
			/>

			<div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 bg-background/30 p-3">
				<Popover open={workDirPopoverOpen} onOpenChange={setWorkDirPopoverOpen}>
					<PopoverTrigger asChild>
						<button
							type="button"
							className="flex h-8 items-center gap-1.5 rounded-lg border border-border/50 bg-card/40 px-2.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-card/70 hover:text-foreground"
						>
							<span className="icon-[mdi--folder-outline] h-3.5 w-3.5" />
							<span className="max-w-[140px] truncate">{value.cwd ? projectName(value.cwd) : "选择工作目录"}</span>
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
							{SCHEDULE_MODES.map((scheduleMode) => (
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
							{ value: "inherit" as const, label: `跟随默认（${defaultExecutionMode === "sandbox" ? "沙盒" : "完全访问"}）`, icon: "icon-[mdi--shield-outline]" },
							{ value: "full-access" as const, label: "完全访问", icon: "icon-[mdi--shield-check-outline]" },
							{ value: "sandbox" as const, label: "使用沙盒", icon: "icon-[mdi--shield-lock-outline]", disabled: Boolean(sandboxUnavailableReason) },
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

				<Popover open={modelDropdownOpen} onOpenChange={setModelDropdownOpen}>
					<PopoverTrigger asChild>
						<button
							type="button"
							className="flex h-8 items-center gap-1.5 rounded-lg border border-border/50 bg-card/40 px-2.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-card/70 hover:text-foreground"
						>
							<span className="icon-[mdi--brain] h-3.5 w-3.5" />
							<span className="max-w-[160px] truncate">
								{selectedModel?.displayName ?? (models.length === 0 ? "暂无模型" : "选择模型")}
							</span>
							<span className="icon-[mdi--chevron-down] h-3.5 w-3.5 opacity-60" />
						</button>
					</PopoverTrigger>
					{models.length > 0 && (
						<PopoverContent align="start" side="top" className="w-72 overflow-hidden rounded-xl p-0">
							<div className="max-h-[280px] overflow-y-auto py-1">
								{[...groupedModels.entries()].map(([provider, providerModels]) => (
									<div key={provider}>
										<div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
											{provider}
										</div>
										{providerModels.map((model) => {
											const isSelected = model.key === value.modelKey;
											const isDefault = model.key === modelsConfig?.defaultModel;
											return (
												<button
													key={model.key}
													type="button"
													onClick={() => {
														set("modelKey", model.key);
														setModelDropdownOpen(false);
													}}
													className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
														isSelected
															? "bg-primary/10 text-primary"
															: "text-foreground hover:bg-accent/50"
													}`}
												>
													<span className="min-w-0 flex-1 truncate">{model.displayName}</span>
													{model.supportsImage && (
														<span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
															vision
														</span>
													)}
													{model.tags?.map((tag) => (
														<span key={tag} className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
															{tag.trim()}
														</span>
													))}
													{model.remote && (
														<span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
															remote
														</span>
													)}
													{isDefault && (
														<span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
															默认
														</span>
													)}
													{isSelected && <span className="icon-[mdi--check] h-3.5 w-3.5 shrink-0" />}
												</button>
											);
										})}
									</div>
								))}
							</div>
						</PopoverContent>
					)}
				</Popover>

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
						<span>{value.enabled ?? true ? "已启用" : "已停用"}</span>
					</button>
				)}
			</div>
		</div>
	);
}
