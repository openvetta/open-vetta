import type { DesktopActionApprovalRequest, DesktopActionJsonValue } from "@preload/api.js";
import { useActionApproval } from "./useActionApproval";
import { Button } from "../components/ui/button";

interface ExecutionInputBase {
	operation: string;
	projectId: string;
	taskIds?: string[];
	approvalUi?: string;
}

function parseExecutionInput(input: DesktopActionApprovalRequest["input"]): ExecutionInputBase | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const record = input as Record<string, unknown>;
	const validOperations = ["delete-all", "start", "stop", "reset", "reset-failed"];
	if (typeof record.operation !== "string" || !validOperations.includes(record.operation)) return null;
	if (typeof record.projectId !== "string") return null;
	if (record.operation === "reset-failed") {
		if (!Array.isArray(record.taskIds) || record.taskIds.length === 0) return null;
		return { operation: record.operation, projectId: record.projectId, taskIds: record.taskIds as string[] };
	}
	return { operation: record.operation, projectId: record.projectId };
}

const operationLabels: Record<string, string> = {
	"delete-all": "删除全部任务",
	start: "开始执行",
	stop: "停止执行",
	reset: "重置项目",
	"reset-failed": "重置失败任务",
};

const operationIcons: Record<string, string> = {
	"delete-all": "icon-[mdi--delete-sweep-outline]",
	start: "icon-[mdi--play-circle-outline]",
	stop: "icon-[mdi--stop-circle-outline]",
	reset: "icon-[mdi--restart]",
	"reset-failed": "icon-[mdi--refresh-circle]",
};

const operationDescriptions: Record<string, string> = {
	"delete-all": "将删除该项目下所有未运行的任务",
	start: "将开始执行项目中待执行的任务",
	stop: "将停止项目中正在运行的任务",
	reset: "将重置项目中所有任务的状态",
	"reset-failed": "将重置指定的失败任务",
};

export function BatchTasksExecutionApproval(): JSX.Element | null {
	const approval = useActionApproval("batch-tasks.execution");
	if (!approval) return null;
	const { request, responding, error, approve, reject } = approval;

	const input = parseExecutionInput(request.input);
	const isDangerous = input?.operation === "delete-all" || input?.operation === "reset";

	return (
		<div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/50 px-4 backdrop-blur-sm">
			<div className="w-full max-w-[400px] rounded-lg border border-border bg-popover p-3 shadow-lg">
				<div className="flex items-center gap-2.5">
					<div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${isDangerous ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
						<span className={`${isDangerous ? "icon-[mdi--alert-outline]" : "icon-[mdi--cog-play-outline]"} h-3.5 w-3.5`} />
					</div>
					<div className="min-w-0">
						<h2 className="text-[13px] font-semibold text-foreground">批量执行控制确认</h2>
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
						<div className="rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5">
							<span className="text-[11px] text-muted-foreground">操作说明</span>
							<p className="mt-1 text-[11px] leading-4 text-foreground">{operationDescriptions[input.operation] ?? "执行批量任务操作"}</p>
						</div>
						{input.operation === "reset-failed" && input.taskIds && (
							<div className="rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5">
								<span className="text-[11px] text-muted-foreground">重置任务数量</span>
								<p className="mt-1 text-[11px] font-medium leading-4 text-foreground">{input.taskIds.length} 个任务</p>
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
