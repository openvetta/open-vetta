import type { DesktopActionApprovalRequest } from "@preload/api.js";
import { Button } from "./ui/button";

interface ActionApprovalDialogProps {
	request: DesktopActionApprovalRequest | null;
	onDecision: (approved: boolean) => void;
}

function formatInput(request: DesktopActionApprovalRequest): string {
	return JSON.stringify(request.input, null, 2);
}

export function ActionApprovalDialog({ request, onDecision }: ActionApprovalDialogProps): JSX.Element | null {
	if (!request) return null;

	return (
		<div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/50 px-4 backdrop-blur-sm">
			<div className="w-full max-w-[520px] rounded-xl border border-border bg-popover p-4 shadow-lg">
				<div className="flex items-start gap-3">
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<span className="icon-[mdi--shield-check-outline] h-4 w-4" />
					</div>
					<div className="min-w-0">
						<h2 className="text-[15px] font-semibold text-foreground">{request.title}</h2>
						<p className="mt-1 text-[12px] leading-5 text-muted-foreground">{request.summary}</p>
					</div>
				</div>

				<div className="mt-4 space-y-3">
					<div>
						<div className="text-[11px] font-medium text-muted-foreground">Action</div>
						<div className="mt-1 rounded-lg border border-border/50 bg-background/50 px-3 py-2 font-mono text-[12px] text-foreground">
							{request.actionId}
						</div>
					</div>
					<div>
						<div className="text-[11px] font-medium text-muted-foreground">参数</div>
						<pre className="mt-1 max-h-[240px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/50 bg-background/50 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">
							{formatInput(request)}
						</pre>
					</div>
					<div className="text-[11px] text-muted-foreground">权限：{request.permission}</div>
				</div>

				<div className="mt-4 flex justify-end gap-2">
					<Button variant="ghost" size="sm" onClick={() => onDecision(false)}>
						拒绝
					</Button>
					<Button size="sm" onClick={() => onDecision(true)}>
						允许并执行
					</Button>
				</div>
			</div>
		</div>
	);
}
