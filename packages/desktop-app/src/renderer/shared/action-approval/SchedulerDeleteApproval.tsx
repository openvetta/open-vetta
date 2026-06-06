import { Button } from "../components/ui/button";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { useActionApproval } from "./useActionApproval";
import { useApprovalCountdown } from "./useApprovalCountdown";

interface DeleteTaskInput {
	operation: "delete";
	taskId: string;
	approvalUi?: string;
}

export function SchedulerDeleteApproval(): JSX.Element | null {
	const approval = useActionApproval("scheduler.delete");
	const countdown = useApprovalCountdown(approval?.request.approvalId);
	if (!approval) return null;
	const { request, responding, error, approve, reject } = approval;

	const input = request.input as unknown as DeleteTaskInput;

	return (
		<Dialog open>
			<DialogContent
				className="max-h-[90vh] overflow-auto sm:max-w-[480px]"
				showCloseButton={false}
				onInteractOutside={(event) => event.preventDefault()}
			>
				<div className="border-b border-border/60 p-5">
					<div className="flex items-start gap-3">
						<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
							<span className="icon-[mdi--clock-remove-outline] h-5 w-5" />
						</div>
						<div className="min-w-0 flex-1">
							<h2 className="text-[15px] font-semibold text-foreground">删除定时任务确认</h2>
							<p className="mt-1 text-[12px] leading-5 text-muted-foreground">{request.summary}</p>
						</div>
					</div>
				</div>

				<div className="space-y-3 p-5">
					{input && (
						<>
							<div className="rounded-lg border border-border/50 bg-background/50 p-3">
								<div className="flex items-start gap-3">
									<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
										<span className="icon-[mdi--clipboard-text-clock-outline] h-4 w-4 text-muted-foreground" />
									</div>
									<div className="min-w-0 flex-1">
										<div className="truncate text-[12px] font-semibold text-foreground">待删除任务</div>
										<div className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">{input.taskId}</div>
									</div>
								</div>
							</div>

							<div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
								<span className="icon-[mdi--alert-outline] mt-0.5 h-4 w-4 shrink-0" />
								<div>
									<p className="text-[11px] leading-5">
										删除定时任务将同时删除该任务的所有执行记录，此操作无法撤销。
									</p>
									<p className="mt-1 text-[11px] leading-5">
										如果任务正在运行，请先中止任务后再删除。
									</p>
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
						<Button variant="destructive" size="sm" disabled={responding} onClick={() => approve()}>
							{responding ? "删除中..." : "确认删除"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
