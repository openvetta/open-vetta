import { Button } from "../components/ui/button";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { useActionApproval } from "./useActionApproval";
import { useApprovalCountdown } from "./useApprovalCountdown";

interface ToggleTaskInput {
	operation: "enable" | "disable";
	taskId: string;
	approvalUi?: string;
}

const operationDetails: Record<
	"enable" | "disable",
	{ label: string; icon: string; description: string }
> = {
	enable: {
		label: "启用任务",
		icon: "icon-[mdi--play-circle-outline]",
		description: "启用后，定时任务将按照 Cron 表达式设定的时间自动执行。",
	},
	disable: {
		label: "停用任务",
		icon: "icon-[mdi--pause-circle-outline]",
		description: "停用后，定时任务将不再自动执行，但任务配置和历史记录会保留。",
	},
};

export function SchedulerToggleApproval(): JSX.Element | null {
	const approval = useActionApproval("scheduler.toggle");
	if (!approval) return null;
	const { request, responding, error, approve, reject } = approval;
	const countdown = useApprovalCountdown();

	const input = request.input as unknown as ToggleTaskInput;
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
								input?.operation === "disable"
									? "bg-muted text-muted-foreground"
									: "bg-primary/10 text-primary"
							}`}
						>
							<span className={`${detail?.icon ?? "icon-[mdi--cog-play-outline]"} h-5 w-5`} />
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex flex-wrap items-center gap-2">
								<h2 className="text-[15px] font-semibold text-foreground">定时任务状态变更确认</h2>
								{detail && (
									<span
										className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
											input?.operation === "disable"
												? "bg-muted text-muted-foreground"
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
										<div className="text-[11px] font-semibold text-foreground">操作说明</div>
										<p className="mt-1 text-[11px] leading-5 text-muted-foreground">{detail.description}</p>
									</div>
								</div>
							</div>
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
						<Button size="sm" disabled={responding} onClick={() => approve()}>
							{responding ? "处理中..." : `确认${detail?.label ?? "操作"}`}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
