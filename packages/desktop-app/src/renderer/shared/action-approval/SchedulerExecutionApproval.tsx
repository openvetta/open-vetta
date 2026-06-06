import { Button } from "../components/ui/button";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { useActionApproval } from "./useActionApproval";
import { useApprovalCountdown } from "./useApprovalCountdown";

interface ExecutionTaskInput {
	operation: "run-now" | "abort";
	taskId: string;
	approvalUi?: string;
}

const operationDetails: Record<
	"run-now" | "abort",
	{ label: string; icon: string; description: string; warning?: string; destructive?: boolean }
> = {
	"run-now": {
		label: "立即执行",
		icon: "icon-[mdi--play-circle-outline]",
		description: "立即触发一次定时任务的执行，无需等待下一个调度时间。任务将使用当前配置的提示词和参数运行。",
	},
	abort: {
		label: "中止运行",
		icon: "icon-[mdi--stop-circle-outline]",
		description: "中止当前正在运行的定时任务 Agent。任务执行会被中断，已产生的输出会保留。",
		warning: "中止操作会立即终止 Agent 运行，当前执行状态可能不完整。",
		destructive: true,
	},
};

export function SchedulerExecutionApproval(): JSX.Element | null {
	const approval = useActionApproval("scheduler.run-now");
	if (!approval) return null;
	const { request, responding, error, approve, reject } = approval;
	const countdown = useApprovalCountdown();

	const input = request.input as unknown as ExecutionTaskInput;
	const detail = operationDetails[input.operation];

	return (
		<Dialog open>
			<DialogContent
				className="max-h-[90vh] overflow-auto sm:max-w-[480px]"
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
								<h2 className="text-[15px] font-semibold text-foreground">定时任务执行确认</h2>
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
										<span className="icon-[mdi--clipboard-text-clock-outline] h-4 w-4 text-muted-foreground" />
									</div>
									<div className="min-w-0 flex-1">
										<div className="truncate text-[12px] font-semibold text-foreground">目标任务</div>
										<div className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">{input.taskId}</div>
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
							拒绝（{countdown}）
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
