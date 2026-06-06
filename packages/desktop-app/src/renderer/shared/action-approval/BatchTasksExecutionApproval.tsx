import type { DesktopActionApprovalRequest } from "@preload/api.js";
import { batchProjectsAtom, type BatchTask, type BatchTaskStatus } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { useActionApproval } from "./useActionApproval";

type ExecutionOperation = "delete-all" | "start" | "stop" | "reset" | "reset-failed";

interface ExecutionInput {
	operation: ExecutionOperation;
	projectId: string;
	taskIds?: string[];
}

function parseExecutionInput(input: DesktopActionApprovalRequest["input"]): ExecutionInput | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const record = input as Record<string, unknown>;
	const operations: ExecutionOperation[] = ["delete-all", "start", "stop", "reset", "reset-failed"];
	if (
		typeof record.operation !== "string" ||
		!operations.includes(record.operation as ExecutionOperation) ||
		typeof record.projectId !== "string"
	) {
		return null;
	}
	if (record.operation === "reset-failed") {
		if (!Array.isArray(record.taskIds) || !record.taskIds.every((id) => typeof id === "string")) return null;
		return { operation: "reset-failed", projectId: record.projectId, taskIds: record.taskIds };
	}
	return { operation: record.operation as ExecutionOperation, projectId: record.projectId };
}

const operationDetails: Record<
	ExecutionOperation,
	{ label: string; icon: string; description: string; warning?: string; destructive?: boolean }
> = {
	"delete-all": {
		label: "删除全部任务",
		icon: "icon-[mdi--delete-sweep-outline]",
		description: "删除项目内所有非运行任务；运行中的任务会保留。",
		warning: "排队任务会先移出队列，随后连同任务记录、会话状态和产物目录永久删除。",
		destructive: true,
	},
	start: {
		label: "开始执行",
		icon: "icon-[mdi--play-circle-outline]",
		description: "将所有待执行任务加入队列，并继续已暂停任务；已完成或失败任务不会重跑。",
	},
	stop: {
		label: "停止并清理",
		icon: "icon-[mdi--stop-circle-outline]",
		description: "停止项目中的全部未完成任务，保留已完成任务。",
		warning: "排队、运行、失败和暂停任务的会话、状态及产物目录会被清理并重置为待执行。",
		destructive: true,
	},
	reset: {
		label: "清空并重跑",
		icon: "icon-[mdi--restart]",
		description: "清空整个项目的执行状态和产物，然后立即重新执行全部任务。",
		warning: "全部任务的会话、状态和产物目录都会被删除，包括已完成任务。该操作无法撤销。",
		destructive: true,
	},
	"reset-failed": {
		label: "重置失败任务",
		icon: "icon-[mdi--refresh-circle]",
		description: "清理所选失败任务；项目仍在执行时会立即重新入队，否则恢复为待执行。",
		warning: "所选失败任务的旧会话、错误状态和已有产物会被删除。",
		destructive: true,
	},
};

const statusLabels: Record<BatchTaskStatus, string> = {
	pending: "待执行",
	running: "运行中",
	completed: "已完成",
	failed: "失败",
	paused: "已暂停",
};

function countStatuses(tasks: BatchTask[]): Record<BatchTaskStatus, number> {
	const counts: Record<BatchTaskStatus, number> = { pending: 0, running: 0, completed: 0, failed: 0, paused: 0 };
	for (const task of tasks) counts[task.status] += 1;
	return counts;
}

export function BatchTasksExecutionApproval(): JSX.Element | null {
	const approval = useActionApproval("batch-tasks.execution");
	const projects = useAtomValue(batchProjectsAtom);
	if (!approval) return null;
	const { request, responding, error, approve, reject } = approval;

	const input = parseExecutionInput(request.input);
	const project = input ? projects.find((item) => item.id === input.projectId) : undefined;
	const detail = input ? operationDetails[input.operation] : undefined;
	const counts = countStatuses(project?.tasks ?? []);
	const selectedTasks =
		input?.operation === "reset-failed"
			? (input.taskIds ?? []).map((id) => project?.tasks.find((task) => task.id === id) ?? { id })
			: [];
	const affectedCount = input
		? {
				"delete-all": (project?.tasks.length ?? 0) - counts.running,
				start: counts.pending + counts.paused,
				stop: counts.pending + counts.running + counts.failed + counts.paused,
				reset: project?.tasks.length ?? 0,
				"reset-failed": selectedTasks.filter((task) => "status" in task && task.status === "failed").length,
			}[input.operation]
		: 0;

	return (
		<Dialog open>
			<DialogContent
				className="max-h-[90vh] overflow-auto sm:max-w-[560px]"
				showCloseButton={false}
				onInteractOutside={(event) => event.preventDefault()}
			>
				<div className="border-b border-border/60 p-5">
					<div className="flex items-start gap-3">
						<div
							className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
								detail?.destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
							}`}
						>
							<span className={`${detail?.icon ?? "icon-[mdi--cog-play-outline]"} h-5 w-5`} />
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex flex-wrap items-center gap-2">
								<h2 className="text-[15px] font-semibold text-foreground">批量执行控制确认</h2>
								{detail && (
									<span
										className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
											detail.destructive
												? "bg-destructive/10 text-destructive"
												: "bg-primary/10 text-primary"
										}`}
									>
										{detail.label}
									</span>
								)}
							</div>
							<p className="mt-1 text-[12px] leading-5 text-muted-foreground">{request.summary}</p>
						</div>
					</div>
				</div>

				<div className="space-y-3 p-5">
					{input && detail && (
						<>
							<div className="rounded-lg border border-border/50 bg-background/50 p-3">
								<div className="flex items-start justify-between gap-4">
									<div className="min-w-0">
										<div className="truncate text-[13px] font-semibold text-foreground">
											{project?.name ?? "未在当前列表中找到该项目"}
										</div>
										<div className="mt-1 break-all text-[10px] leading-4 text-muted-foreground">
											{input.projectId}
										</div>
									</div>
									<div className="shrink-0 text-right">
										<div className="text-lg font-semibold tabular-nums text-foreground">
											{project?.tasks.length ?? "?"}
										</div>
										<div className="text-[10px] text-muted-foreground">任务总数</div>
									</div>
								</div>
								<div className="mt-3 grid grid-cols-5 gap-1.5 border-t border-border/40 pt-3">
									{(Object.keys(statusLabels) as BatchTaskStatus[]).map((status) => (
										<div key={status} className="rounded-md bg-muted/60 px-1 py-2 text-center">
											<div className="text-[12px] font-semibold tabular-nums text-foreground">
												{counts[status]}
											</div>
											<div className="mt-0.5 text-[9px] text-muted-foreground">{statusLabels[status]}</div>
										</div>
									))}
								</div>
							</div>

							<div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
								<div className="flex items-start justify-between gap-4">
									<div className="flex min-w-0 gap-2">
										<span className={`${detail.icon} mt-0.5 h-4 w-4 shrink-0 text-primary`} />
										<div>
											<div className="text-[11px] font-semibold text-foreground">执行后会发生什么</div>
											<p className="mt-1 text-[11px] leading-5 text-muted-foreground">{detail.description}</p>
										</div>
									</div>
									<div className="shrink-0 rounded-lg bg-background/70 px-3 py-2 text-center">
										<div className="text-base font-semibold tabular-nums text-foreground">{affectedCount}</div>
										<div className="text-[9px] text-muted-foreground">预计影响</div>
									</div>
								</div>
							</div>

							{input.operation === "reset-failed" && (
								<div className="rounded-lg border border-border/50 bg-background/50 p-3">
									<div className="mb-2 flex items-center justify-between">
										<span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
											指定任务
										</span>
										<span className="text-[10px] text-muted-foreground">{selectedTasks.length} 个</span>
									</div>
									<div className="max-h-36 space-y-1.5 overflow-auto">
										{selectedTasks.map((task) => (
											<div
												key={task.id}
												className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-2.5 py-2"
											>
												<div className="min-w-0">
													<div className="truncate text-[11px] font-medium text-foreground">
														{"name" in task ? task.name : task.id}
													</div>
													{"name" in task && (
														<div className="mt-0.5 truncate text-[9px] text-muted-foreground">
															{task.sourcePath}
														</div>
													)}
												</div>
												<span
													className={`shrink-0 text-[10px] ${
														"status" in task && task.status === "failed"
															? "text-destructive"
															: "text-muted-foreground"
													}`}
												>
													{"status" in task ? statusLabels[task.status] : "未找到"}
												</span>
											</div>
										))}
									</div>
									{affectedCount !== selectedTasks.length && (
										<p className="mt-2 text-[10px] leading-4 text-amber-700 dark:text-amber-300">
											只有当前状态为“失败”的任务会被处理，其他任务 ID 将被忽略。
										</p>
									)}
								</div>
							)}

							{detail.warning && (
								<div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
									<span className="icon-[mdi--alert-outline] mt-0.5 h-4 w-4 shrink-0" />
									<p className="text-[11px] leading-5">{detail.warning}</p>
								</div>
							)}
						</>
					)}

					{!input && (
						<pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/50 bg-background/50 p-3 font-mono text-[10px] leading-4 text-foreground">
							{JSON.stringify(request.input, null, 2)}
						</pre>
					)}
				</div>

				<div className="border-t border-border/60 px-5 py-4">
					<div className="mb-3 flex items-center justify-between text-[10px] text-muted-foreground">
						<span>请求权限</span>
						<span className="font-mono">{request.permission}</span>
					</div>
					{error && <div className="mb-3 text-[11px] text-destructive">{error}</div>}
					<div className="flex justify-end gap-2">
						<Button variant="ghost" size="sm" disabled={responding} onClick={reject}>
							拒绝
						</Button>
						<Button
							size="sm"
							variant={detail?.destructive ? "destructive" : "default"}
							disabled={responding}
							onClick={() => approve()}
						>
							{responding ? "处理中..." : `确认${detail?.label ?? "操作"}`}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
