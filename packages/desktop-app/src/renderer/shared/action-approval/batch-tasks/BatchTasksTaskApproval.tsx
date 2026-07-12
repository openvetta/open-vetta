import { BatchTasksTaskApprovalView } from "./BatchTasksTaskApprovalView";
import type { DesktopActionApprovalRequest, DesktopActionJsonValue } from "@preload/api.js";
import { batchProjectsAtom, type BatchTaskStatus } from "@shared/store/atoms";
import { useThemeComponent } from "@vetta/theme-sdk";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Textarea } from "../../components/ui/textarea";
import { BatchTasksApprovalFrameView } from "./BatchTasksApprovalFrameView";
import { useActionApproval } from "../useActionApproval";

type TaskOperation = "run" | "retry" | "stop" | "delete" | "resume" | "resume-with-text" | "delete-session";

interface TaskInput {
	operation: TaskOperation;
	projectId: string;
	taskId: string;
	text?: string;
}

function parseTaskInput(input: DesktopActionApprovalRequest["input"]): TaskInput | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const record = input as Record<string, unknown>;
	const validOperations: TaskOperation[] = [
		"run",
		"retry",
		"stop",
		"delete",
		"resume",
		"resume-with-text",
		"delete-session",
	];
	if (
		typeof record.operation !== "string" ||
		!validOperations.includes(record.operation as TaskOperation) ||
		typeof record.projectId !== "string" ||
		typeof record.taskId !== "string"
	) {
		return null;
	}
	return {
		operation: record.operation as TaskOperation,
		projectId: record.projectId,
		taskId: record.taskId,
		...(record.operation === "resume-with-text" && typeof record.text === "string" ? { text: record.text } : {}),
	};
}

function useBatchTasksTaskApprovalModel() {
	return true;
}

export function BatchTasksTaskApproval(): JSX.Element | null {
	void BatchTasksTaskApprovalView;
	const _model = useBatchTasksTaskApprovalModel();
	void _model;
	const approval = useActionApproval("batch-tasks.task");
	if (!approval) return null;

	return <BatchTasksTaskApprovalContent key={approval.request.approvalId} approval={approval} />;
}

interface BatchTasksTaskApprovalContentProps {
	approval: NonNullable<ReturnType<typeof useActionApproval>>;
}

function BatchTasksTaskApprovalContent({ approval }: BatchTasksTaskApprovalContentProps): JSX.Element {
	const { t } = useTranslation("common");
	const projects = useAtomValue(batchProjectsAtom);
	const { request, responding, error, approve, reject } = approval;

	const input = parseTaskInput(request.input);
	const project = input ? projects.find((item) => item.id === input.projectId) : undefined;
	const task = input ? project?.tasks.find((item) => item.id === input.taskId) : undefined;
	const detail = input ? getTaskOperationDetail(input.operation, t) : undefined;
	const isEditable = input?.operation === "resume-with-text";
	const [resumeText, setResumeText] = useState(input?.text?.trim() || t("batchTasksApproval.resumeDefaultText"));
	const ThemedBatchTasksApprovalFrameView = useThemeComponent(
		"root.approval.batchTasksFrameView",
		BatchTasksApprovalFrameView,
	);
	const approveInput = (): void => {
		if (!input || !isEditable) {
			approve();
			return;
		}
		const originalInput = request.input as Record<string, DesktopActionJsonValue>;
		approve({ ...originalInput, text: resumeText.trim() || t("batchTasksApproval.resumeDefaultText") });
	};

	const body = (
		<>
				{input && detail && (
					<>
						<div className="rounded-lg border border-border/50 bg-background/50 p-3">
							<div className="flex items-start gap-3">
								<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
									<span className="icon-[mdi--folder-outline] h-4 w-4 text-muted-foreground" />
								</div>
								<div className="min-w-0 flex-1">
									<div className="truncate text-[12px] font-semibold text-foreground">
										{task?.name ?? t("batchTasksApproval.taskNotFoundInCurrentList")}
									</div>
									<div className="mt-0.5 truncate text-[10px] text-muted-foreground">
										{project?.name ?? input.projectId}
									</div>
								</div>
								{task && (
									<span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
										{getTaskStatusLabel(task.status, t)}
									</span>
								)}
							</div>
							<div className="mt-3 space-y-2 border-t border-border/40 pt-3 text-[11px]">
								<div className="flex items-start justify-between gap-4">
									<span className="shrink-0 text-muted-foreground">{t("batchTasksApproval.sourceFolder")}</span>
									<span className="min-w-0 break-all text-right text-foreground">
										{task?.sourcePath ?? t("batchTasksApproval.unknown")}
									</span>
								</div>
								<div className="flex items-start justify-between gap-4">
									<span className="shrink-0 text-muted-foreground">{t("batchTasksApproval.taskId")}</span>
									<span className="min-w-0 break-all text-right font-mono text-[10px] text-foreground">
										{input.taskId}
									</span>
								</div>
								<div className="flex items-center justify-between gap-4">
									<span className="text-muted-foreground">{t("batchTasksApproval.relatedSession")}</span>
									<span className="text-foreground">{task?.sessionPath ? t("batchTasksApproval.yes") : t("batchTasksApproval.no")}</span>
								</div>
							</div>
						</div>

						<div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
							<div className="flex gap-2">
									<span className={`${detail.icon} mt-0.5 h-4 w-4 shrink-0 text-primary`} />
									<div>
									<div className="text-[11px] font-semibold text-foreground">{t("batchTasksApproval.afterActionTitle")}</div>
									<p className="mt-1 text-[11px] leading-5 text-muted-foreground">{detail.description}</p>
								</div>
							</div>
						</div>

						{input.operation === "resume-with-text" && (
							<div className="rounded-lg border border-border/50 bg-background/50 p-3">
								<label
									className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
									htmlFor="batch-task-resume-text"
								>
									{t("batchTasksApproval.resumeTextLabel")}
								</label>
								<Textarea
									key={request.approvalId}
									id="batch-task-resume-text"
									value={resumeText}
									onChange={(event) => setResumeText(event.target.value)}
									className="min-h-28 resize-y"
								/>
							</div>
						)}

						{task?.error && (
							<div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
								<div className="mb-1 text-[10px] font-medium text-destructive">{t("batchTasksApproval.lastError")}</div>
								<p className="max-h-24 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-muted-foreground">
									{task.error}
								</p>
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
		</>
	);

	return (
		<ThemedBatchTasksApprovalFrameView
			presentation={isEditable ? "drawer" : "dialog"}
			title={detail?.title ?? t("batchTasksApproval.taskFallbackTitle")}
			summary={detail?.summary ?? request.summary}
			icon={detail?.icon ?? "icon-[mdi--checkbox-marked-circle-outline]"}
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
			onApprove={approveInput}
		>
			{body}
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

function getTaskOperationDetail(operation: TaskOperation, t: ReturnType<typeof useTranslation<"common">>["t"]): {
	label: string;
	title: string;
	summary: string;
	icon: string;
	description: string;
	warning?: string;
	destructive?: boolean;
} {
	switch (operation) {
		case "run":
			return {
				label: t("batchTasksApproval.taskRunLabel"),
				title: t("batchTasksApproval.taskRunTitle"),
				summary: t("batchTasksApproval.taskRunSummary"),
				icon: "icon-[mdi--play-circle-outline]",
				description: t("batchTasksApproval.taskRunDescription"),
			};
		case "retry":
			return {
				label: t("batchTasksApproval.taskRetryLabel"),
				title: t("batchTasksApproval.taskRetryTitle"),
				summary: t("batchTasksApproval.taskRetrySummary"),
				icon: "icon-[mdi--refresh]",
				description: t("batchTasksApproval.taskRetryDescription"),
				warning: t("batchTasksApproval.taskRetryWarning"),
				destructive: true,
			};
		case "stop":
			return {
				label: t("batchTasksApproval.taskStopLabel"),
				title: t("batchTasksApproval.taskStopTitle"),
				summary: t("batchTasksApproval.taskStopSummary"),
				icon: "icon-[mdi--stop-circle-outline]",
				description: t("batchTasksApproval.taskStopDescription"),
				warning: t("batchTasksApproval.taskStopWarning"),
				destructive: true,
			};
		case "delete":
			return {
				label: t("batchTasksApproval.taskDeleteLabel"),
				title: t("batchTasksApproval.taskDeleteTitle"),
				summary: t("batchTasksApproval.taskDeleteSummary"),
				icon: "icon-[mdi--delete-outline]",
				description: t("batchTasksApproval.taskDeleteDescription"),
				warning: t("batchTasksApproval.taskDeleteWarning"),
				destructive: true,
			};
		case "resume":
			return {
				label: t("batchTasksApproval.taskResumeLabel"),
				title: t("batchTasksApproval.taskResumeTitle"),
				summary: t("batchTasksApproval.taskResumeSummary"),
				icon: "icon-[mdi--play-circle-outline]",
				description: t("batchTasksApproval.taskResumeDescription"),
			};
		case "resume-with-text":
			return {
				label: t("batchTasksApproval.taskResumeWithTextLabel"),
				title: t("batchTasksApproval.taskResumeWithTextTitle"),
				summary: t("batchTasksApproval.taskResumeWithTextSummary"),
				icon: "icon-[mdi--message-plus-outline]",
				description: t("batchTasksApproval.taskResumeWithTextDescription"),
			};
		case "delete-session":
			return {
				label: t("batchTasksApproval.taskDeleteSessionLabel"),
				title: t("batchTasksApproval.taskDeleteSessionTitle"),
				summary: t("batchTasksApproval.taskDeleteSessionSummary"),
				icon: "icon-[mdi--chat-remove-outline]",
				description: t("batchTasksApproval.taskDeleteSessionDescription"),
				warning: t("batchTasksApproval.taskDeleteSessionWarning"),
				destructive: true,
			};
	}
}
