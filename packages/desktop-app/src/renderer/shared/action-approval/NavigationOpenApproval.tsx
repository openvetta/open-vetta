import type { DesktopActionApprovalRequest } from "@preload/api.js";
import { useActionApproval } from "./useActionApproval";
import { Button } from "../components/ui/button";

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
		<div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/50 px-4 backdrop-blur-sm">
			<div className="w-full max-w-[320px] rounded-lg border border-border bg-popover p-3 shadow-lg">
				<div className="flex items-center gap-2.5">
					<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
						<span className="icon-[mdi--arrow-top-right-bold-box-outline] h-3.5 w-3.5" />
					</div>
					<div className="min-w-0">
						<h2 className="text-[13px] font-semibold text-foreground">页面跳转确认</h2>
						<p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{request.summary}</p>
					</div>
				</div>

				{input && (
					<div className="mt-3 space-y-1.5">
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
					<div className="mt-3">
						<pre className="max-h-[160px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5 font-mono text-[10px] leading-4 text-foreground">
							{JSON.stringify(request.input, null, 2)}
						</pre>
					</div>
				)}

				<div className="mt-2.5 text-[10px] text-muted-foreground">权限：{request.permission}</div>
				{error && <div className="mt-1.5 text-[10px] text-destructive">{error}</div>}

				<div className="mt-3 flex justify-end gap-1.5">
					<Button variant="ghost" size="sm" className="h-7 px-2.5 text-[11px]" disabled={responding} onClick={reject}>
						拒绝
					</Button>
					<Button size="sm" className="h-7 px-2.5 text-[11px]" disabled={responding} onClick={() => approve()}>
						{responding ? "跳转中..." : "确认跳转"}
					</Button>
				</div>
			</div>
		</div>
	);
}
