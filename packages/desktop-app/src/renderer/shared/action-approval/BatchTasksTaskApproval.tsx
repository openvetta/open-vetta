import type { DesktopActionApprovalRequest, DesktopActionJsonValue } from "@preload/api.js";
import { batchProjectsAtom, type BatchTaskStatus } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useRef } from "react";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { ActionApprovalFrame } from "./ActionApprovalSurface";
import { useActionApproval } from "./useActionApproval";

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

const operationDetails: Record<
	TaskOperation,
	{ label: string; icon: string; description: string; warning?: string; destructive?: boolean }
> = {
	run: {
		label: "执行任务",
		icon: "icon-[mdi--play-circle-outline]",
		description: "为这个待执行任务创建会话并开始运行。",
	},
	retry: {
		label: "从头重试",
		icon: "icon-[mdi--refresh]",
		description: "清理旧结果后，从头重新执行这个任务。",
		warning: "旧会话、状态和任务目录中的已有产物会被删除，无法恢复。",
		destructive: true,
	},
	stop: {
		label: "停止并清理",
		icon: "icon-[mdi--stop-circle-outline]",
		description: "中止运行中或排队中的任务，并将状态重置为待执行。",
		warning: "当前会话、运行状态和任务目录中的已有产物会被删除。",
		destructive: true,
	},
	delete: {
		label: "删除任务",
		icon: "icon-[mdi--delete-outline]",
		description: "从项目中永久移除这个任务。",
		warning: "任务记录、项目子目录、会话状态及产物会被永久删除，无法撤销。",
		destructive: true,
	},
	resume: {
		label: "继续任务",
		icon: "icon-[mdi--play-circle-outline]",
		description: "向暂停的原会话发送“继续”，保留已有上下文和产物。",
	},
	"resume-with-text": {
		label: "带说明继续",
		icon: "icon-[mdi--message-play-outline]",
		description: "将补充说明发送给暂停的原会话，然后继续执行。",
	},
	"delete-session": {
		label: "删除任务会话",
		icon: "icon-[mdi--chat-remove-outline]",
		description: "删除与任务关联的对话会话。",
		warning: "会话历史将不可恢复；任务记录和任务目录不会删除。",
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

export function BatchTasksTaskApproval(): JSX.Element | null {
	const approval = useActionApproval("batch-tasks.task");
	const projects = useAtomValue(batchProjectsAtom);
	const textRef = useRef<HTMLTextAreaElement>(null);
	if (!approval) return null;
	const { request, responding, error, approve, reject } = approval;

	const input = parseTaskInput(request.input);
	const project = input ? projects.find((item) => item.id === input.projectId) : undefined;
	const task = input ? project?.tasks.find((item) => item.id === input.taskId) : undefined;
	const detail = input ? operationDetails[input.operation] : undefined;
	const isEditable = input?.operation === "resume-with-text";
	const approveInput = (): void => {
		if (!input || !isEditable) {
			approve();
			return;
		}
		const originalInput = request.input as Record<string, DesktopActionJsonValue>;
		approve({ ...originalInput, text: textRef.current?.value.trim() || "继续" });
	};

	return (
		<ActionApprovalFrame editable={isEditable}>
				<div className="border-b border-border/60 p-5">
					<div className="flex items-start gap-3">
						<div
							className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
								detail?.destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
							}`}
						>
							<span className={`${detail?.icon ?? "icon-[mdi--checkbox-marked-circle-outline]"} h-5 w-5`} />
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex flex-wrap items-center gap-2">
								<h2 className="text-[15px] font-semibold text-foreground">批量子任务操作确认</h2>
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
								<div className="flex items-start gap-3">
									<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
										<span className="icon-[mdi--folder-outline] h-4 w-4 text-muted-foreground" />
									</div>
									<div className="min-w-0 flex-1">
										<div className="truncate text-[12px] font-semibold text-foreground">
											{task?.name ?? "未在当前列表中找到该任务"}
										</div>
										<div className="mt-0.5 truncate text-[10px] text-muted-foreground">
											{project?.name ?? input.projectId}
										</div>
									</div>
									{task && (
										<span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
											{statusLabels[task.status]}
										</span>
									)}
								</div>
								<div className="mt-3 space-y-2 border-t border-border/40 pt-3 text-[11px]">
									<div className="flex items-start justify-between gap-4">
										<span className="shrink-0 text-muted-foreground">源文件夹</span>
										<span className="min-w-0 break-all text-right text-foreground">
											{task?.sourcePath ?? "未知"}
										</span>
									</div>
									<div className="flex items-start justify-between gap-4">
										<span className="shrink-0 text-muted-foreground">任务 ID</span>
										<span className="min-w-0 break-all text-right font-mono text-[10px] text-foreground">
											{input.taskId}
										</span>
									</div>
									<div className="flex items-center justify-between gap-4">
										<span className="text-muted-foreground">关联会话</span>
										<span className="text-foreground">{task?.sessionPath ? "有" : "无"}</span>
									</div>
								</div>
							</div>

							<div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
								<div className="flex gap-2">
									<span className={`${detail.icon} mt-0.5 h-4 w-4 shrink-0 text-primary`} />
									<div>
										<div className="text-[11px] font-semibold text-foreground">执行后会发生什么</div>
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
										发送给原会话的补充说明
									</label>
									<Textarea
										key={request.approvalId}
										id="batch-task-resume-text"
										ref={textRef}
										defaultValue={input.text?.trim() || "继续"}
										className="min-h-28 resize-y"
									/>
								</div>
							)}

							{task?.error && (
								<div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
									<div className="mb-1 text-[10px] font-medium text-destructive">最近一次错误</div>
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
							onClick={approveInput}
						>
							{responding ? "处理中..." : `确认${detail?.label ?? "操作"}`}
						</Button>
					</div>
				</div>
		</ActionApprovalFrame>
	);
}
