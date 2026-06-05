import type { DesktopActionApprovalRequest } from "@preload/api.js";
import { useActionApproval } from "./useActionApproval";
import { Button } from "../components/ui/button";

const THEME_MODE_LABELS: Record<string, string> = {
	light: "浅色",
	dark: "深色",
	auto: "跟随系统",
};

function isThemeSetInput(
	input: DesktopActionApprovalRequest["input"],
): input is { type: "set"; mode?: string; themeId?: string } {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
	return (input as Record<string, unknown>).type === "set";
}

export function ThemeChangeApproval(): JSX.Element | null {
	const approval = useActionApproval("appearance.theme-change");
	if (!approval) return null;
	const { request, responding, error, approve, reject } = approval;

	const input = isThemeSetInput(request.input) ? request.input : null;

	return (
		<div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/50 px-4 backdrop-blur-sm">
			<div className="w-full max-w-[320px] rounded-lg border border-border bg-popover p-3 shadow-lg">
				<div className="flex items-center gap-2.5">
					<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
						<span className="icon-[mdi--palette-outline] h-3.5 w-3.5" />
					</div>
					<div className="min-w-0">
						<h2 className="text-[13px] font-semibold text-foreground">主题变更确认</h2>
						<p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{request.summary}</p>
					</div>
				</div>

				{input && (
					<div className="mt-3 space-y-1.5">
						{input.mode && (
							<div className="flex items-center justify-between rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5">
								<span className="text-[11px] text-muted-foreground">显示模式</span>
								<span className="text-[11px] font-medium text-foreground">
									{THEME_MODE_LABELS[input.mode] ?? input.mode}
								</span>
							</div>
						)}
						{input.themeId && (
							<div className="flex items-center justify-between rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5">
								<span className="text-[11px] text-muted-foreground">主题风格</span>
								<span className="text-[11px] font-medium text-foreground">{input.themeId}</span>
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
						{responding ? "提交中..." : "确认变更"}
					</Button>
				</div>
			</div>
		</div>
	);
}
