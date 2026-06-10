import type { DesktopActionApprovalRequest } from "@preload/api.js";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { useActionApproval } from "../useActionApproval";

function isNavigationOpenInput(
	input: DesktopActionApprovalRequest["input"],
): input is { type: "open"; target: string; tab?: string; section?: string } {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
	const record = input as Record<string, unknown>;
	return record.type === "open" && typeof record.target === "string";
}

export function NavigationOpenApproval(): JSX.Element | null {
	const approval = useActionApproval("navigation.open");
	if (!approval) return null;
	const { request, responding, error, approve, reject } = approval;

	const input = isNavigationOpenInput(request.input) ? request.input : null;

	return (
		<Dialog open>
			<DialogContent
				className="max-h-[90vh] overflow-hidden sm:max-w-[520px]"
				showCloseButton={false}
				onInteractOutside={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>页面跳转确认</DialogTitle>
					<DialogDescription>{request.summary}</DialogDescription>
				</DialogHeader>
				<div className="min-h-0 overflow-y-auto">
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
				</div>
				<DialogFooter>
					<Button variant="outline" size="sm" disabled={responding} onClick={reject}>
						拒绝（{approval.countdown.formatted}）
					</Button>
					<Button size="sm" disabled={responding} onClick={() => approve()}>
						{responding ? "跳转中..." : "确认跳转"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
