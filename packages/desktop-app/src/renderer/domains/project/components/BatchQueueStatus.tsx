import { useSetAtom } from "jotai";
import type { BatchProject, BatchTask } from "@shared/store/atoms";
import { confirmDialogAtom, openSessionFnRef } from "@shared/store/atoms";
import { Tooltip, TooltipContent, TooltipTrigger } from "@shared/components/ui/tooltip";
import { useBatchTasks } from "../../batch-tasks/hooks/useBatchTasks";

function statusLabel(status: BatchTask["status"], hasSession: boolean): string {
	if (status === "pending") {
		return hasSession ? "等待中" : "未执行";
	}
	const labels: Record<Exclude<BatchTask["status"], "pending">, string> = {
		running: "运行中",
		paused: "已暂停",
		completed: "已完成",
		failed: "失败",
	};
	return labels[status];
}

function relativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return "刚刚";
	if (minutes < 60) return `${minutes} 分钟前`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} 小时前`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days} 天前`;
	return `${Math.floor(days / 7)} 周前`;
}

function truncateError(error: string, maxLength: number = 60): string {
	if (error.length <= maxLength) return error;
	return error.slice(0, maxLength) + "...";
}

interface BatchQueueStatusProps {
	project: BatchProject;
}

export function BatchQueueStatus({ project }: BatchQueueStatusProps): JSX.Element {
	const setConfirm = useSetAtom(confirmDialogAtom);
	const { runTask, pauseTask, resumeTask, batchRetryFailed, batchPause, batchResume, batchRunNeverExecuted, batchRestartAll } =
		useBatchTasks();

	const tasks = project.tasks;
	const total = tasks.length;
	const completed = tasks.filter((t) => t.status === "completed").length;
	const running = tasks.filter((t) => t.status === "running").length;
	const failed = tasks.filter((t) => t.status === "failed").length;
	const paused = tasks.filter((t) => t.status === "paused").length;
	const neverExecuted = tasks.filter((t) => t.status === "pending" && !t.sessionId).length;
	const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

	const handleBatchRunNeverExecuted = () => {
		if (neverExecuted === 0) return;
		setConfirm({
			title: "确认执行所有未执行的任务",
			message: `将执行 ${neverExecuted} 个未执行的任务，是否继续？`,
			confirmLabel: "执行",
			onConfirm: async () => {
				await batchRunNeverExecuted(project.id);
			},
		});
	};

	const handleBatchPause = () => {
		if (running === 0) return;
		setConfirm({
			title: "确认暂停所有任务",
			message: "正在运行的任务将暂停执行，是否继续？",
			confirmLabel: "暂停",
			onConfirm: async () => {
				await batchPause(project.id);
			},
		});
	};

	const handleBatchResume = async () => {
		if (paused === 0) return;
		await batchResume(project.id);
	};

	const handleBatchRetry = () => {
		if (failed === 0) return;
		setConfirm({
			title: "确认重试失败的任务",
			message: `将重新执行 ${failed} 个失败的任务，是否继续？`,
			confirmLabel: "重试",
			onConfirm: async () => {
				await batchRetryFailed(project.id);
			},
		});
	};

	const handleBatchRestartAll = () => {
		setConfirm({
			title: "确认全部重新开始",
			message: `将删除所有任务的会话和文件，然后重新执行全部 ${total} 个任务。此操作不可撤回，是否继续？`,
			confirmLabel: "全部重新开始",
			cancelLabel: "取消",
			variant: "danger",
			onConfirm: async () => {
				await batchRestartAll(project.id);
			},
		});
	};

	const handleRunTask = async (taskId: string) => {
		await runTask(project.id, taskId);
	};

	const handlePauseTask = (task: BatchTask) => {
		setConfirm({
			title: "确认暂停任务",
			message: "任务将暂停执行，是否继续？",
			confirmLabel: "暂停",
			onConfirm: async () => {
				await pauseTask(project.id, task.id);
			},
		});
	};

	const handleResumeTask = async (taskId: string) => {
		await resumeTask(project.id, taskId);
	};

	const handleGoToSession = (task: BatchTask) => {
		if (task.sessionPath && openSessionFnRef.current) {
			void openSessionFnRef.current(task.cwd, task.sessionPath);
		}
	};

	return (
		<div className="flex flex-col gap-5">
			{/* Progress overview */}
			<div className="rounded-2xl border border-border/40 bg-gradient-to-b from-accent/30 to-transparent p-5">
				{/* Progress bar */}
				<div className="mb-4">
					<div className="mb-2 flex items-end justify-between">
						<span className="text-[13px] font-medium text-foreground">执行进度</span>
						<span className="tabular-nums text-[22px] font-semibold leading-none tracking-tight text-foreground">
							{progress}
							<span className="text-[13px] font-normal text-muted-foreground/60">%</span>
						</span>
					</div>
					<div className="h-2 overflow-hidden rounded-full bg-accent/60">
						<div
							className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500 ease-out"
							style={{ width: `${progress}%` }}
						/>
					</div>
					<div className="mt-1.5 text-[11px] text-muted-foreground/50">
						{completed} / {total} 个任务已完成
					</div>
				</div>

				{/* Status counters */}
				<div className="grid grid-cols-4 gap-2">
					<StatusCounter label="运行中" count={running} color="emerald" pulse={running > 0} />
					<StatusCounter label="已完成" count={completed} color="emerald" />
					<StatusCounter label="失败" count={failed} color="red" />
					<StatusCounter label="未执行" count={neverExecuted} color="neutral" />
				</div>

				{/* Batch actions */}
				<div className="mt-4 flex items-center gap-1.5">
					<QueueActionButton
						icon="icon-[mdi--rocket-launch-outline]"
						label={`执行全部 (${neverExecuted})`}
						onClick={handleBatchRunNeverExecuted}
						disabled={neverExecuted === 0}
					/>
					<QueueActionButton
						icon="icon-[mdi--play]"
						label={`继续 (${paused})`}
						onClick={() => void handleBatchResume()}
						disabled={paused === 0}
					/>
					<QueueActionButton
						icon="icon-[mdi--restart]"
						label={`重试失败 (${failed})`}
						onClick={handleBatchRetry}
						disabled={failed === 0}
					/>
					<QueueActionButton
						icon="icon-[mdi--pause]"
						label={`暂停全部 (${running})`}
						onClick={handleBatchPause}
						disabled={running === 0}
					/>
					<QueueActionButton
						icon="icon-[mdi--refresh]"
						label="全部重新开始"
						onClick={handleBatchRestartAll}
						disabled={total === 0}
					/>
				</div>
			</div>

			{/* Task list */}
			<div className="flex flex-col gap-1.5">
				<div className="mb-1 flex items-center gap-2 px-1">
					<span className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground/40">
						任务队列
					</span>
					<div className="h-px flex-1 bg-border/30" />
				</div>
				{tasks.map((task) => (
					<TaskRow
						key={task.id}
						task={task}
						onRun={() => void handleRunTask(task.id)}
						onPause={() => handlePauseTask(task)}
						onResume={() => void handleResumeTask(task.id)}
						onGoToSession={() => handleGoToSession(task)}
					/>
				))}
			</div>
		</div>
	);
}

function StatusCounter({
	label,
	count,
	color,
	pulse,
}: {
	label: string;
	count: number;
	color: "emerald" | "red" | "neutral";
	pulse?: boolean;
}): JSX.Element {
	const dotColor =
		color === "emerald" ? "bg-emerald-500" : color === "red" ? "bg-red-500" : "bg-muted-foreground/40";
	const pingColor = color === "emerald" ? "bg-emerald-400" : "";

	return (
		<div className="flex flex-col items-center gap-1 rounded-xl bg-accent/40 px-2 py-2.5">
			<div className="flex items-center gap-1.5">
				<div className="relative flex h-2 w-2">
					{pulse && count > 0 && (
						<span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${pingColor}`} />
					)}
					<span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`} />
				</div>
				<span className="tabular-nums text-[15px] font-semibold text-foreground">{count}</span>
			</div>
			<span className="text-[10px] text-muted-foreground/60">{label}</span>
		</div>
	);
}

function QueueActionButton({
	icon,
	label,
	onClick,
	disabled,
}: {
	icon: string;
	label: string;
	onClick: () => void;
	disabled?: boolean;
}): JSX.Element {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all duration-150 active:scale-[0.97] ${
				disabled
					? "cursor-not-allowed text-muted-foreground/20"
					: "text-muted-foreground hover:bg-accent hover:text-foreground"
			}`}
		>
			<span className={`${icon} h-3.5 w-3.5`} />
			{label}
		</button>
	);
}

function TaskRow({
	task,
	onRun,
	onPause,
	onResume,
	onGoToSession,
}: {
	task: BatchTask;
	onRun: () => void;
	onPause: () => void;
	onResume: () => void;
	onGoToSession: () => void;
}): JSX.Element {
	const hasSession = !!task.sessionId;

	const dotColor =
		task.status === "completed"
			? "bg-emerald-500"
			: task.status === "running"
				? "bg-emerald-500"
				: task.status === "failed"
					? "bg-red-500"
					: task.status === "paused"
						? "bg-yellow-500"
						: "bg-muted-foreground/30";

	return (
		<div className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-accent/40">
			{/* Status dot */}
			<div className="relative flex h-2 w-2 shrink-0">
				{task.status === "running" && (
					<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
				)}
				<span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`} />
			</div>

			{/* Task name */}
			<span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{task.name}</span>

			{/* Error indicator */}
			{task.status === "failed" && task.error && (
				<Tooltip>
					<TooltipTrigger asChild>
						<div className="flex items-center gap-1 text-red-400/80">
							<span className="icon-[mdi--alert-circle-outline] h-3.5 w-3.5" />
							<span className="hidden max-w-[120px] truncate text-[11px] sm:inline">
								{truncateError(task.error)}
							</span>
						</div>
					</TooltipTrigger>
					<TooltipContent className="max-w-[300px]">{task.error}</TooltipContent>
				</Tooltip>
			)}

			{/* Status label */}
			<span className="shrink-0 text-[11px] text-muted-foreground/50">
				{statusLabel(task.status, hasSession)}
			</span>

			{/* Time */}
			{task.sessionId && (
				<span className="hidden shrink-0 text-[11px] text-muted-foreground/30 sm:inline">
					{relativeTime(task.updatedAt)}
				</span>
			)}

			{/* Actions (visible on hover) */}
			<div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
				{task.sessionPath && (
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={onGoToSession}
								className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
							>
								<span className="icon-[mdi--open-in-new] h-3.5 w-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent>跳转到会话</TooltipContent>
					</Tooltip>
				)}
				{task.status === "pending" && (
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={onRun}
								className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
							>
								<span className="icon-[mdi--play] h-3.5 w-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent>执行</TooltipContent>
					</Tooltip>
				)}
				{task.status === "running" && (
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={onPause}
								className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
							>
								<span className="icon-[mdi--pause] h-3.5 w-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent>暂停</TooltipContent>
					</Tooltip>
				)}
				{(task.status === "paused" || task.status === "failed") && (
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={task.status === "paused" ? onResume : onRun}
								className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
							>
								<span className="icon-[mdi--restart] h-3.5 w-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent>{task.status === "paused" ? "继续" : "重试"}</TooltipContent>
					</Tooltip>
				)}
			</div>
		</div>
	);
}
