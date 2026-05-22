import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAtomValue } from "jotai";
import { useScheduledTasks } from "../hooks/useScheduledTasks";
import { Button } from "@shared/components/ui/button";
import {
	Dialog,
	DialogContent,
} from "@shared/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
import { projectsAtom, remoteProvidersAtom } from "@shared/store/atoms";
import type { ExecutionModeOverride, ScheduledTask, SessionExecutionMode } from "@shared/store/atoms";
import type { ModelsConfigData } from "@preload/api";
import { pathBasename } from "@shared/lib/utils";
import {
	type Schedule,
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

// ─── Model picker ───

interface ModelOption {
	provider: string;
	modelId: string;
	displayName: string;
	key: string;
	remote?: boolean;
	tags?: string[];
	supportsImage?: boolean;
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

// ─── Main component ───

export function TaskFormDialog({ open, task, onClose }: TaskFormDialogProps): JSX.Element {
	const { createTask, updateTask } = useScheduledTasks();
	const projects = useAtomValue(projectsAtom);
	const remoteProviders = useAtomValue(remoteProvidersAtom);
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
	const [executionPopoverOpen, setExecutionPopoverOpen] = useState(false);
	const [modelKey, setModelKey] = useState<string | undefined>(undefined);
	const [modelsConfig, setModelsConfig] = useState<ModelsConfigData | null>(null);
	const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
	const modelDropdownRef = useRef<HTMLDivElement>(null);

	const models = useMemo(() => {
		const localModels = modelsConfig ? flattenModels(modelsConfig) : [];
		const remoteModels = Object.keys(remoteProviders).length > 0
			? flattenModels({ providers: remoteProviders as ModelsConfigData["providers"] }, true)
			: [];
		const localKeys = new Set(localModels.map((m) => m.key));
		return [...localModels, ...remoteModels.filter((m) => !localKeys.has(m.key))];
	}, [modelsConfig, remoteProviders]);

	const groupedModels = useMemo(() => {
		const map = new Map<string, ModelOption[]>();
		for (const m of models) {
			const list = map.get(m.provider) ?? [];
			list.push(m);
			map.set(m.provider, list);
		}
		return map;
	}, [models]);

	const selectedModel = models.find((m) => m.key === modelKey);

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

			void window.vetta.models.get().then((c) => {
				setModelsConfig(c);
				const local = flattenModels(c);
				const remote = Object.keys(remoteProviders).length > 0
					? flattenModels({ providers: remoteProviders as ModelsConfigData["providers"] }, true)
					: [];
				const localKeys = new Set(local.map((m) => m.key));
				const all = [...local, ...remote.filter((m) => !localKeys.has(m.key))];
				const preferred = task?.modelKey ?? c.defaultModel;
				if (preferred && all.some((o) => o.key === preferred)) {
					setModelKey(preferred);
				} else if (all.length > 0) {
					setModelKey(all[0].key);
				} else {
					setModelKey(undefined);
				}
			});
		}
	}, [open, task, projects, remoteProviders]);

	useEffect(() => {
		if (!modelDropdownOpen) return;
		function handleClick(e: MouseEvent) {
			if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
				setModelDropdownOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [modelDropdownOpen]);

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
		const taskData = { name, prompt, cron, isOnce, enabled: true, cwd, executionMode, modelKey };

		if (task) {
			await updateTask(task.id, taskData);
		} else {
			await createTask(taskData);
		}
		onClose();
	};

	const scheduleLabel = describeSchedule(schedule);

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

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent
				className="flex max-h-[82vh] flex-col gap-0 overflow-hidden rounded-xl border border-border/60 bg-card/95 p-0 backdrop-blur-md sm:max-w-3xl"
				showCloseButton={false}
			>
				{/* ─── Header ─── */}
				<div className="flex items-center gap-3 px-7 pt-6 pb-3">
					<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/20">
						<span className="icon-[mdi--clock-time-eight-outline] h-4 w-4 text-primary" />
					</div>
					<input
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						className="w-full border-none bg-transparent text-[15px] font-semibold text-foreground placeholder:text-muted-foreground/40 focus:outline-none! focus-visible:outline-none! focus:shadow-none! focus-visible:shadow-none!"
						placeholder={task ? "任务名称" : "新建任务"}
						autoFocus
					/>
				</div>

				{/* ─── Body: prompt textarea ─── */}
				<div className="flex-1 overflow-y-auto px-7 pb-5">
					<textarea
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						className="min-h-[140px] w-full resize-y rounded-lg border-none bg-transparent text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
						placeholder="输入提示词..."
						rows={6}
					/>
				</div>

				{/* ─── Meta row ─── */}
				<div className="flex flex-wrap items-center gap-2 border-t border-border/40 bg-background/30 px-5 py-3">
					{/* Project */}
					<Popover open={projectPopoverOpen} onOpenChange={setProjectPopoverOpen}>
						<PopoverTrigger asChild>
							<button
								type="button"
								className="flex h-8 items-center gap-1.5 rounded-lg border border-border/50 bg-card/40 px-2.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-card/70 hover:text-foreground"
							>
								<span className="icon-[mdi--folder-outline] h-3.5 w-3.5" />
								<span className="max-w-[140px] truncate">{cwd ? projectName(cwd) : "选择项目"}</span>
								<span className="icon-[mdi--chevron-down] h-3.5 w-3.5 opacity-60" />
							</button>
						</PopoverTrigger>
						<PopoverContent align="start" className="w-56 p-1">
							{projects.map((p) => (
								<button
									key={p.cwd}
									type="button"
									onClick={() => { setCwd(p.cwd); setProjectPopoverOpen(false); }}
									className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] transition-colors ${
										cwd === p.cwd
											? "bg-primary/10 text-primary"
											: "text-foreground hover:bg-accent/50"
									}`}
								>
									<span className="icon-[mdi--folder-outline] h-3.5 w-3.5" />
									<span className="truncate">{projectName(p.cwd)}</span>
								</button>
							))}
						</PopoverContent>
					</Popover>

					{/* Schedule */}
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
								{SCHEDULE_MODES.map((m) => (
									<button
										key={m.key}
										type="button"
										onClick={() => handleModeChange(m.key)}
										className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
											mode === m.key
												? "bg-primary/10 text-primary"
												: "text-muted-foreground/60 hover:bg-accent/50 hover:text-foreground"
										}`}
									>
										{m.label}
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

					{/* Execution mode */}
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
							].map((opt) => {
								const isSelected = executionMode === opt.value;
								return (
									<button
										key={opt.value}
										type="button"
										disabled={opt.disabled}
										title={opt.disabled ? sandboxUnavailableReason ?? undefined : undefined}
										onClick={() => {
											setExecutionMode(opt.value);
											setExecutionPopoverOpen(false);
										}}
										className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
											isSelected
												? "bg-primary/10 text-primary"
												: "text-foreground hover:bg-accent/50"
										}`}
									>
										<span className={`${opt.icon} h-3.5 w-3.5`} />
										<span className="flex-1 truncate text-left">{opt.label}</span>
										{isSelected && <span className="icon-[mdi--check] h-3.5 w-3.5" />}
									</button>
								);
							})}
						</PopoverContent>
					</Popover>

					{/* Model picker */}
					<div ref={modelDropdownRef} className="relative">
						<button
							type="button"
							onClick={() => setModelDropdownOpen((v) => !v)}
							className="flex h-8 items-center gap-1.5 rounded-lg border border-border/50 bg-card/40 px-2.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-card/70 hover:text-foreground"
						>
							<span className="icon-[mdi--brain] h-3.5 w-3.5" />
							<span className="max-w-[160px] truncate">
								{selectedModel?.displayName ?? (models.length === 0 ? "暂无模型" : "选择模型")}
							</span>
							<span className="icon-[mdi--chevron-down] h-3.5 w-3.5 opacity-60" />
						</button>

						{modelDropdownOpen && models.length > 0 && (
							<div className="absolute bottom-full left-0 z-50 mb-1 w-72 overflow-hidden rounded-xl border border-border bg-popover shadow-md">
								<div className="max-h-[280px] overflow-y-auto py-1">
									{[...groupedModels.entries()].map(([provider, providerModels]) => (
										<div key={provider}>
											<div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
												{provider}
											</div>
											{providerModels.map((m) => {
												const isSelected = m.key === modelKey;
												const isDefault = m.key === modelsConfig?.defaultModel;
												return (
													<button
														key={m.key}
														type="button"
														onClick={() => {
															setModelKey(m.key);
															setModelDropdownOpen(false);
														}}
														className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
															isSelected
																? "bg-primary/10 text-primary"
																: "text-foreground hover:bg-accent/50"
														}`}
													>
														<span className="min-w-0 flex-1 truncate">{m.displayName}</span>
														{m.supportsImage && (
															<span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
																vision
															</span>
														)}
														{m.tags?.map((tag) => (
															<span key={tag} className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
																{tag.trim()}
															</span>
														))}
														{m.remote && (
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
							</div>
						)}
					</div>
				</div>

				{/* ─── Action footer ─── */}
				<div className="flex items-center justify-end gap-2 border-t border-border/40 px-5 py-3">
					<Button
						type="button"
						variant="ghost"
						onClick={onClose}
						className="h-9 rounded-lg px-3 text-[13px] text-muted-foreground hover:text-foreground"
					>
						<span className="icon-[mdi--close] h-4 w-4" />
						<span>取消</span>
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={!canSubmit}
						className="h-9 rounded-lg bg-primary px-4 text-[13px] text-primary-foreground hover:bg-primary/90"
					>
						<span className="icon-[mdi--check] h-4 w-4" />
						<span>{task ? "保存" : "创建"}</span>
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
