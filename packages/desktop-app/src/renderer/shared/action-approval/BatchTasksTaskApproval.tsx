import type { DesktopActionApprovalRequest, DesktopActionJsonValue } from "@preload/api.js";
import { useActionApproval } from "./useActionApproval";
import { Button } from "../components/ui/button";

interface TaskInputBase {
	operation: string;
	projectId: string;
	taskId: string;
	text?: string;
	approvalUi?: string;
}

function parseTaskInput(input: DesktopActionApprovalRequest["input"]): TaskInputBase | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const record = input as Record<string, unknown>;
	const validOperations = ["run", "retry", "stop", "delete", "resume", "resume-with-text", "delete-session"];
	if (
		typeof record.operation !== "string" ||
		!validOperations.includes(record.operation) ||
		typeof record.projectId !== "string" ||
		typeof record.taskId !== "string"
	) {
		return null;
	}
	const result: TaskInputBase = {
		operation: record.operation,
		projectId: record.projectId,
		taskId: record.taskId,
	};
	if (record.operation === "resume-with-text" && typeof record.text === "string") {
		result.text = record.text;
	}
	return result;
}

const operationLabels: Record<string, string> = {
	run: "执行任务",
	retry: "重试任务",
	stop: "停止任务",
	delete: "删除任务",
	resume: "继续任务",
	"resume-with-text": "继续任务（带补充说明）",
	"delete-session": "删除任务会话",
};

const operationIcons: Record<string, string> = {
	run: "icon-[mdi--play-circle-outline]",
	retry: "icon-[mdi--refresh]",
	stop: "icon-[mdi--stop-circle-outline]",
	delete: "icon-[mdi--delete-outline]",
	resume: "icon-[mdi--play-circle-outline]",
	"resume-with-text": "icon-[mdi--play-circle-outline]",
	"delete-session": "icon-[mdi--chat-remove-outline]",
};

export function BatchTasksTaskApproval(): JSX.Element | null {
	const approval = useActionApproval("batch-tasks.task");
	if (!approval) return null;
	const { request, responding, error, approve, reject } = approval;

	const input = parseTaskInput(request.input);
	const isDangerous = input?.operation === "delete" || input?.operation === "delete-session";

	return (
		<div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/50 px-4 backdrop-blur-sm">
			<div className="w-full max-w-[400px] rounded-lg border border-border bg-popover p-3 shadow-lg">
				<div className="flex items-center gap-2.5">
					<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
						<span className="icon-[mdi--checkbox-marked-circle-outline] h-3.5 w-3.5" />
					</div>
					<div className="min-w-0">
						<h2 className="text-[13px] font-semibold text-foreground">批量任务操作确认</h2>
						<p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{request.summary}</p>
					</div>
				</div>

				{input && (
					<div className="mt-3 space-y-1.5">
						<div className="flex items-center justify-between rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5">
							<span className="text-[11px] text-muted-foreground">操作类型</span>
							<div className="flex items-center gap-1.5">
								<span className={`${operationIcons[input.operation] ?? "icon-[mdi--cog-outline]"} h-3.5 w-3.5 text-muted-foreground`} />
								<span className="text-[11px] font-medium text-foreground">{operationLabels[input.operation] ?? input.operation}</span>
							</div>
						</div>
						<div className="flex items-center justify-between rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5">
							<span className="text-[11px] text-muted-foreground">项目路径</span>
							<span className="max-w-[200px] truncate text-[11px] font-medium text-foreground" title={input.projectId}>{input.projectId}</span>
						</div>
						<div className="flex items-center justify-between rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5">
							<span className="text-[11px] text-muted-foreground">任务 ID</span>
							<span className="max-w-[200px] truncate font-mono text-[10px] font-medium text-foreground" title={input.taskId}>{input.taskId}</span>
						</div>
						{input.operation === "resume-with-text" && input.text && (
							<div className="rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5">
								<span className="text-[11px] text-muted-foreground">补充说明</span>
								<p className="mt-1 max-h-[80px] overflow-auto text-[11px] leading-4 text-foreground">{input.text}</p>
							</div>
						)}
					</div>
				)}

				{!input && (
					<div className="mt-3">
						<pre className="max-h-[160px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5 font-mono text-[10px] leading-4 text-foreground">
							{JSON.stringify(request.input, null, 2)}
						</pre>
					</div>
				)}

				<div className="mt-2.5 text-[10px] text-muted-foreground">权限：{request.permission}</div>
				{error && <div className="mt-1.5 text-[10px] text-destructive">{error}</div>}

				<div className="mt-3 flex justify-end gap-1.5">
					<Button variant="ghost" size="sm" className="h-7 px-2.5 text-[11px]" disabled={responding} onClick={reject}>
						拒绝
					</Button>
					<Button
						size="sm"
						className="h-7 px-2.5 text-[11px]"
						variant={isDangerous ? "destructive" : "default"}
						disabled={responding}
						onClick={() => approve()}
					>
						{responding ? "处理中..." : `确认${operationLabels[input?.operation ?? ""] ?? "操作"}`}
					</Button>
				</div>
			</div>
		</div>
	);
}
