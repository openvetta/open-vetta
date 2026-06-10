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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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
	const schedulerDisplay =
		request.actionId === "scheduler.task" || request.actionId === "scheduler.execution"
			? operation
				? schedulerOperationDisplays[operation]
				: undefined
			: undefined;
	return {
		title: schedulerDisplay?.title ?? request.title,
		summary: schedulerDisplay?.summary ?? request.summary,
		confirmLabel: schedulerDisplay?.confirmLabel ?? "确认执行",
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
