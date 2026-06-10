import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useActionApproval } from "./useActionApproval";

interface ApprovalDisplay {
	title: string;
	summary: string;
	confirmLabel: string;
	permissionLabel: string;
}

const schedulerOperationDisplays: Record<string, Omit<ApprovalDisplay, "permissionLabel">> = {
	create: {
		title: "创建定时任务确认",
		summary: "请确认即将创建的定时任务配置。确认后任务会保存，并按启用状态参与调度。",
		confirmLabel: "确认创建",
	},
	update: {
		title: "更新定时任务确认",
		summary: "请确认即将写入的定时任务变更。确认后只会更新本次请求包含的字段。",
		confirmLabel: "确认更新",
	},
	delete: {
		title: "删除定时任务确认",
		summary: "请确认是否删除该定时任务及其执行记录。此操作无法撤销。",
		confirmLabel: "确认删除",
	},
	enable: {
		title: "启用定时任务确认",
		summary: "请确认是否启用该定时任务。启用后任务会按照 Cron 表达式自动执行。",
		confirmLabel: "确认启用",
	},
	disable: {
		title: "停用定时任务确认",
		summary: "请确认是否停用该定时任务。停用后任务配置和历史记录会保留，但不会自动执行。",
		confirmLabel: "确认停用",
	},
	"run-now": {
		title: "立即执行定时任务确认",
		summary: "请确认是否立即触发该定时任务执行一次。本次执行会使用任务当前配置。",
		confirmLabel: "确认执行",
	},
	abort: {
		title: "中止定时任务确认",
		summary: "请确认是否中止当前正在运行的定时任务 Agent。已产生的输出会保留。",
		confirmLabel: "确认中止",
	},
};

const batchProjectOperationDisplays: Record<string, Omit<ApprovalDisplay, "permissionLabel">> = {
	create: {
		title: "创建批量项目确认",
		summary: "请确认即将创建的批量项目配置。确认后会为每个源文件夹生成一个子任务。",
		confirmLabel: "确认创建项目",
	},
	update: {
		title: "更新批量项目确认",
		summary: "请确认即将写入的批量项目变更。确认后只会应用本次输入中的项目字段。",
		confirmLabel: "确认更新项目",
	},
	delete: {
		title: "删除批量项目确认",
		summary: "请确认是否删除该批量项目、全部子任务、会话状态和任务产物。此操作无法撤销。",
		confirmLabel: "确认删除项目",
	},
};

const batchTaskOperationDisplays: Record<string, Omit<ApprovalDisplay, "permissionLabel">> = {
	run: {
		title: "执行批量子任务确认",
		summary: "请确认是否为该待执行子任务创建会话并开始运行。",
		confirmLabel: "确认执行任务",
	},
	retry: {
		title: "重试批量子任务确认",
		summary: "请确认是否清理该子任务的旧结果，并从头重新执行。",
		confirmLabel: "确认从头重试",
	},
	stop: {
		title: "停止批量子任务确认",
		summary: "请确认是否中止或移出该子任务，并清理会话、状态和产物。",
		confirmLabel: "确认停止并清理",
	},
	delete: {
		title: "删除批量子任务确认",
		summary: "请确认是否从项目中永久删除该子任务及其关联数据。",
		confirmLabel: "确认删除任务",
	},
	resume: {
		title: "继续批量子任务确认",
		summary: "请确认是否向暂停的原会话发送“继续”，并保留已有上下文继续执行。",
		confirmLabel: "确认继续任务",
	},
	"resume-with-text": {
		title: "带说明继续批量子任务确认",
		summary: "请确认发送给暂停会话的补充说明。确认后会保留已有上下文继续执行。",
		confirmLabel: "确认带说明继续",
	},
	"delete-session": {
		title: "删除批量子任务会话确认",
		summary: "请确认是否删除该子任务关联的对话会话。任务记录和任务目录会保留。",
		confirmLabel: "确认删除会话",
	},
};

const batchExecutionOperationDisplays: Record<string, Omit<ApprovalDisplay, "permissionLabel">> = {
	"delete-all": {
		title: "删除全部批量任务确认",
		summary: "请确认是否删除该项目内所有非运行子任务。运行中的任务会保留。",
		confirmLabel: "确认删除全部任务",
	},
	start: {
		title: "开始执行批量项目确认",
		summary: "请确认是否开始执行该批量项目。待执行和已暂停任务会进入执行流程。",
		confirmLabel: "确认开始执行",
	},
	stop: {
		title: "停止批量项目执行确认",
		summary: "请确认是否停止该项目中的未完成任务，并清理相关会话、状态和产物。",
		confirmLabel: "确认停止并清理",
	},
	reset: {
		title: "清空并重跑批量项目确认",
		summary: "请确认是否清空该项目全部任务状态和产物，并立即重新执行整个项目。",
		confirmLabel: "确认清空并重跑",
	},
	"reset-failed": {
		title: "重置失败批量任务确认",
		summary: "请确认是否清理所选失败任务。只有当前状态为失败的任务会被处理。",
		confirmLabel: "确认重置失败任务",
	},
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getOperationDisplay(actionId: string, operation: string | undefined): Omit<ApprovalDisplay, "permissionLabel"> | undefined {
	if (!operation) return undefined;
	if (actionId === "scheduler.task" || actionId === "scheduler.execution") {
		return schedulerOperationDisplays[operation];
	}
	if (actionId === "batch-tasks.project") return batchProjectOperationDisplays[operation];
	if (actionId === "batch-tasks.task") return batchTaskOperationDisplays[operation];
	if (actionId === "batch-tasks.execution") return batchExecutionOperationDisplays[operation];
	return undefined;
}

function getApprovalDisplay(request: {
	actionId: string;
	title: string;
	summary: string;
	permission: string;
	input: unknown;
}): ApprovalDisplay {
	const input = isRecord(request.input) ? request.input : undefined;
	const operation = typeof input?.operation === "string" ? input.operation : undefined;
	const operationDisplay = getOperationDisplay(request.actionId, operation);
	return {
		title: operationDisplay?.title ?? request.title,
		summary: operationDisplay?.summary ?? request.summary,
		confirmLabel: operationDisplay?.confirmLabel ?? "确认执行",
		permissionLabel: request.permission,
	};
}

export function GenericActionApproval(): JSX.Element | null {
	const approval = useActionApproval("generic");
	if (!approval) return null;
	const { request, responding, error, approve, reject } = approval;
	const display = getApprovalDisplay(request);

	return (
		<Dialog open>
			<DialogContent
				className="max-h-[90vh] overflow-hidden sm:max-w-[520px]"
				showCloseButton={false}
				onInteractOutside={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{display.title}</DialogTitle>
					<DialogDescription>{display.summary}</DialogDescription>
				</DialogHeader>
				<div className="min-h-0 overflow-y-auto">
					<pre className="whitespace-pre-wrap break-words rounded-lg border border-border/50 bg-background/50 p-3 font-mono text-[11px] leading-5 text-foreground">
						{JSON.stringify(request.input, null, 2)}
					</pre>
					<div className="mt-3 text-[11px] text-muted-foreground">权限：{display.permissionLabel}</div>
					{error && <div className="mt-2 text-[11px] text-destructive">{error}</div>}
				</div>
				<DialogFooter>
					<Button variant="outline" size="sm" disabled={responding} onClick={reject}>
						拒绝（{approval.countdown.formatted}）
					</Button>
					<Button size="sm" disabled={responding} onClick={() => approve()}>
						{responding ? "处理中..." : display.confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
