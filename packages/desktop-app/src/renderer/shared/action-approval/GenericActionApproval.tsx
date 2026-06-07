import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useActionApproval } from "./useActionApproval";
import { useApprovalCountdown } from "./useApprovalCountdown";

export function GenericActionApproval(): JSX.Element | null {
	const approval = useActionApproval("generic");
	const countdown = useApprovalCountdown(approval?.request.approvalId);
	if (!approval) return null;
	const { request, responding, error, approve, reject } = approval;

	return (
		<Dialog open>
			<DialogContent
				className="max-h-[90vh] overflow-hidden sm:max-w-[520px]"
				showCloseButton={false}
				onInteractOutside={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{request.title}</DialogTitle>
					<DialogDescription>{request.summary}</DialogDescription>
				</DialogHeader>
				<div className="min-h-0 overflow-y-auto">
					<pre className="whitespace-pre-wrap break-words rounded-lg border border-border/50 bg-background/50 p-3 font-mono text-[11px] leading-5 text-foreground">
						{JSON.stringify(request.input, null, 2)}
					</pre>
					<div className="mt-3 text-[11px] text-muted-foreground">权限：{request.permission}</div>
					{error && <div className="mt-2 text-[11px] text-destructive">{error}</div>}
				</div>
				<DialogFooter>
					<Button variant="outline" size="sm" disabled={responding} onClick={reject}>
						拒绝（{countdown}）
					</Button>
					<Button size="sm" disabled={responding} onClick={() => approve()}>
						{responding ? "处理中..." : "确认执行"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
