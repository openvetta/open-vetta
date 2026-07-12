import { BatchTasksExecutionApprovalView } from "./BatchTasksExecutionApprovalView";
import type { DesktopActionApprovalRequest } from "@preload/api.js";
import { batchProjectsAtom, type BatchTask, type BatchTaskStatus } from "@shared/store/atoms";
import { useThemeComponent } from "@vetta/theme-sdk";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { BatchTasksApprovalFrameView } from "./BatchTasksApprovalFrameView";
import { useActionApproval } from "../useActionApproval";

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

function countStatuses(tasks: BatchTask[]): Record<BatchTaskStatus, number> {
	const counts: Record<BatchTaskStatus, number> = { pending: 0, running: 0, completed: 0, failed: 0, paused: 0 };
	for (const task of tasks) counts[task.status] += 1;
	return counts;
}

function useBatchTasksExecutionApprovalModel() {
	return true;
}

export function BatchTasksExecutionApproval(): JSX.Element | null {
	void BatchTasksExecutionApprovalView;
	const _model = useBatchTasksExecutionApprovalModel();
	void _model;
	const { t } = useTranslation("common");
	const approval = useActionApproval("batch-tasks.execution");
	const projects = useAtomValue(batchProjectsAtom);
	if (!approval) return null;
	const { request, responding, error, approve, reject } = approval;

	const input = parseExecutionInput(request.input);
	const project = input ? projects.find((item) => item.id === input.projectId) : undefined;
	const detail = input ? getExecutionOperationDetail(input.operation, t) : undefined;
	const counts = countStatuses(project?.tasks ?? []);
	const ThemedBatchTasksApprovalFrameView = useThemeComponent(
		"root.approval.batchTasksFrameView",
		BatchTasksApprovalFrameView,
	);
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
		<ThemedBatchTasksApprovalFrameView
			presentation="dialog"
			title={detail?.title ?? t("batchTasksApproval.executionFallbackTitle")}
			summary={detail?.summary ?? request.summary}
			icon={detail?.icon ?? "icon-[mdi--cog-play-outline]"}
			badge={detail?.label}
			destructive={detail?.destructive}
			labels={{
				reject: t("actionApproval.reject"),
				confirm: t("batchTasksApproval.confirmAction", { action: detail?.label ?? t("batchTasksApproval.fallbackAction") }),
				responding: t("actionApproval.processing"),
				permission: t("actionApproval.permission", { permission: request.permission }),
			}}
			responding={responding}
			countdown={approval.countdown.formatted}
			error={error}
			onReject={reject}
			onApprove={() => approve()}
		>
					{input && detail && (
						<>
							<div className="rounded-lg border border-border/50 bg-background/50 p-3">
								<div className="flex items-start justify-between gap-4">
									<div className="min-w-0">
										<div className="truncate text-[13px] font-semibold text-foreground">
											{project?.name ?? t("batchTasksApproval.projectNotFoundInCurrentList")}
										</div>
										<div className="mt-1 break-all text-[10px] leading-4 text-muted-foreground">
											{input.projectId}
										</div>
									</div>
									<div className="shrink-0 text-right">
										<div className="text-lg font-semibold tabular-nums text-foreground">
											{project?.tasks.length ?? t("batchTasksApproval.unknownShort")}
										</div>
										<div className="text-[10px] text-muted-foreground">{t("batchTasksApproval.totalTasks")}</div>
									</div>
								</div>
								<div className="mt-3 grid grid-cols-5 gap-1.5 border-t border-border/40 pt-3">
									{(["pending", "running", "completed", "failed", "paused"] as BatchTaskStatus[]).map((status) => (
										<div key={status} className="rounded-md bg-muted/60 px-1 py-2 text-center">
											<div className="text-[12px] font-semibold tabular-nums text-foreground">
												{counts[status]}
											</div>
											<div className="mt-0.5 text-[9px] text-muted-foreground">{getTaskStatusLabel(status, t)}</div>
										</div>
									))}
								</div>
							</div>

							<div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
								<div className="flex items-start justify-between gap-4">
									<div className="flex min-w-0 gap-2">
										<span className={`${detail.icon} mt-0.5 h-4 w-4 shrink-0 text-primary`} />
										<div>
											<div className="text-[11px] font-semibold text-foreground">{t("batchTasksApproval.afterActionTitle")}</div>
											<p className="mt-1 text-[11px] leading-5 text-muted-foreground">{detail.description}</p>
										</div>
									</div>
									<div className="shrink-0 rounded-lg bg-background/70 px-3 py-2 text-center">
										<div className="text-base font-semibold tabular-nums text-foreground">{affectedCount}</div>
										<div className="text-[9px] text-muted-foreground">{t("batchTasksApproval.estimatedImpact")}</div>
									</div>
								</div>
							</div>

							{input.operation === "reset-failed" && (
								<div className="rounded-lg border border-border/50 bg-background/50 p-3">
									<div className="mb-2 flex items-center justify-between">
										<span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
											{t("batchTasksApproval.selectedTasks")}
										</span>
										<span className="text-[10px] text-muted-foreground">{t("batchTasksApproval.count", { count: selectedTasks.length })}</span>
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
													{"status" in task ? getTaskStatusLabel(task.status, t) : t("batchTasksApproval.notFound")}
												</span>
											</div>
										))}
									</div>
									{affectedCount !== selectedTasks.length && (
										<p className="mt-2 text-[10px] leading-4 text-amber-400">
											{t("batchTasksApproval.resetFailedPartialWarning")}
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
		</ThemedBatchTasksApprovalFrameView>
	);
}

function getTaskStatusLabel(status: BatchTaskStatus, t: ReturnType<typeof useTranslation<"common">>["t"]): string {
	switch (status) {
		case "pending":
			return t("batchTasksApproval.status.pending");
		case "running":
			return t("batchTasksApproval.status.running");
		case "completed":
			return t("batchTasksApproval.status.completed");
		case "failed":
			return t("batchTasksApproval.status.failed");
		case "paused":
			return t("batchTasksApproval.status.paused");
	}
}

function getExecutionOperationDetail(operation: ExecutionOperation, t: ReturnType<typeof useTranslation<"common">>["t"]): {
	label: string;
	title: string;
	summary: string;
	icon: string;
	description: string;
	warning?: string;
	destructive?: boolean;
} {
	switch (operation) {
		case "delete-all":
			return {
				label: t("batchTasksApproval.executionDeleteAllLabel"),
				title: t("batchTasksApproval.executionDeleteAllTitle"),
				summary: t("batchTasksApproval.executionDeleteAllSummary"),
				icon: "icon-[mdi--delete-sweep-outline]",
				description: t("batchTasksApproval.executionDeleteAllDescription"),
				warning: t("batchTasksApproval.executionDeleteAllWarning"),
				destructive: true,
			};
		case "start":
			return {
				label: t("batchTasksApproval.executionStartLabel"),
				title: t("batchTasksApproval.executionStartTitle"),
				summary: t("batchTasksApproval.executionStartSummary"),
				icon: "icon-[mdi--play-circle-outline]",
				description: t("batchTasksApproval.executionStartDescription"),
			};
		case "stop":
			return {
				label: t("batchTasksApproval.executionStopLabel"),
				title: t("batchTasksApproval.executionStopTitle"),
				summary: t("batchTasksApproval.executionStopSummary"),
				icon: "icon-[mdi--stop-circle-outline]",
				description: t("batchTasksApproval.executionStopDescription"),
				warning: t("batchTasksApproval.executionStopWarning"),
				destructive: true,
			};
		case "reset":
			return {
				label: t("batchTasksApproval.executionResetLabel"),
				title: t("batchTasksApproval.executionResetTitle"),
				summary: t("batchTasksApproval.executionResetSummary"),
				icon: "icon-[mdi--restart]",
				description: t("batchTasksApproval.executionResetDescription"),
				warning: t("batchTasksApproval.executionResetWarning"),
				destructive: true,
			};
		case "reset-failed":
			return {
				label: t("batchTasksApproval.executionResetFailedLabel"),
				title: t("batchTasksApproval.executionResetFailedTitle"),
				summary: t("batchTasksApproval.executionResetFailedSummary"),
				icon: "icon-[mdi--refresh-circle]",
				description: t("batchTasksApproval.executionResetFailedDescription"),
				warning: t("batchTasksApproval.executionResetFailedWarning"),
				destructive: true,
			};
	}
}
