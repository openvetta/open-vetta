import { Button } from "../components/ui/button";
import { ActionApprovalDialog } from "./ActionApprovalSurface";
import { useActionApproval } from "./useActionApproval";
import { useApprovalCountdown } from "./useApprovalCountdown";

export function GenericActionApproval(): JSX.Element | null {
	const approval = useActionApproval("generic");
	const countdown = useApprovalCountdown(approval?.request.approvalId);
	if (!approval) return null;
	const { request, responding, error, approve, reject } = approval;

	return (
		<ActionApprovalDialog
			title={request.title}
			description={request.summary}
			footer={
			<>
				<Button variant="ghost" size="sm" disabled={responding} onClick={reject}>
					拒绝（{countdown}）
				</Button>
				<Button size="sm" disabled={responding} onClick={() => approve()}>
						{responding ? "处理中..." : "确认执行"}
					</Button>
				</>
			}
		>
			<pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/50 bg-background/50 p-3 font-mono text-[11px] leading-5 text-foreground">
				{JSON.stringify(request.input, null, 2)}
			</pre>
			<div className="mt-3 text-[11px] text-muted-foreground">权限：{request.permission}</div>
			{error && <div className="mt-2 text-[11px] text-destructive">{error}</div>}
		</ActionApprovalDialog>
	);
}
