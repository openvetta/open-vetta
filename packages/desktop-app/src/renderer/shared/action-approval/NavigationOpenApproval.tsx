import type { DesktopActionApprovalRequest } from "@preload/api.js";
import { Button } from "../components/ui/button";
import { ActionApprovalDialog } from "./ActionApprovalSurface";
import { useActionApproval } from "./useActionApproval";
import { useApprovalCountdown } from "./useApprovalCountdown";

function isNavigationOpenInput(
	input: DesktopActionApprovalRequest["input"],
): input is { type: "open"; target: string; tab?: string; section?: string } {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
	const record = input as Record<string, unknown>;
	return record.type === "open" && typeof record.target === "string";
}

export function NavigationOpenApproval(): JSX.Element | null {
	const approval = useActionApproval("navigation.open");
	const countdown = useApprovalCountdown(approval?.request.approvalId);
	if (!approval) return null;
	const { request, responding, error, approve, reject } = approval;

	const input = isNavigationOpenInput(request.input) ? request.input : null;

	return (
		<ActionApprovalDialog
			title="页面跳转确认"
			description={request.summary}
			footer={
			<>
				<Button variant="ghost" size="sm" disabled={responding} onClick={reject}>
					拒绝（{countdown}）
				</Button>
				<Button size="sm" disabled={responding} onClick={() => approve()}>
						{responding ? "跳转中..." : "确认跳转"}
					</Button>
				</>
			}
		>
			{input && (
				<div className="space-y-1.5">
						<div className="flex items-center justify-between rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5">
							<span className="text-[11px] text-muted-foreground">目标页面</span>
							<span className="text-[11px] font-medium text-foreground">{input.target}</span>
						</div>
						{input.tab && (
							<div className="flex items-center justify-between rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5">
								<span className="text-[11px] text-muted-foreground">标签页</span>
								<span className="text-[11px] font-medium text-foreground">{input.tab}</span>
							</div>
						)}
						{input.section && (
							<div className="flex items-center justify-between rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5">
								<span className="text-[11px] text-muted-foreground">设置项</span>
								<span className="text-[11px] font-medium text-foreground">{input.section}</span>
							</div>
						)}
				</div>
			)}

			{!input && (
				<pre className="max-h-[160px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5 font-mono text-[10px] leading-4 text-foreground">
					{JSON.stringify(request.input, null, 2)}
				</pre>
			)}
			<div className="mt-2.5 text-[10px] text-muted-foreground">权限：{request.permission}</div>
			{error && <div className="mt-1.5 text-[10px] text-destructive">{error}</div>}
		</ActionApprovalDialog>
	);
}
