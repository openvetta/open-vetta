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
			<div className="w-full max-w-[420px] rounded-xl border border-border bg-popover p-5 shadow-lg">
				<div className="flex items-start gap-3">
					<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<span className="icon-[mdi--palette-outline] h-5 w-5" />
					</div>
					<div className="min-w-0">
						<h2 className="text-[15px] font-semibold text-foreground">主题变更确认</h2>
						<p className="mt-1 text-[12px] leading-5 text-muted-foreground">{request.summary}</p>
					</div>
				</div>

				{input && (
					<div className="mt-4 space-y-3">
						{input.mode && (
							<div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 px-3 py-2.5">
								<span className="text-[12px] text-muted-foreground">显示模式</span>
								<span className="text-[13px] font-medium text-foreground">
									{THEME_MODE_LABELS[input.mode] ?? input.mode}
								</span>
							</div>
						)}
						{input.themeId && (
							<div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 px-3 py-2.5">
								<span className="text-[12px] text-muted-foreground">主题风格</span>
								<span className="text-[13px] font-medium text-foreground">{input.themeId}</span>
							</div>
						)}
					</div>
				)}

				{!input && (
					<div className="mt-4">
						<pre className="max-h-[200px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/50 bg-background/50 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">
							{JSON.stringify(request.input, null, 2)}
						</pre>
					</div>
				)}

				<div className="mt-4 text-[11px] text-muted-foreground">权限：{request.permission}</div>
				{error && <div className="mt-2 text-[11px] text-destructive">{error}</div>}

				<div className="mt-4 flex justify-end gap-2">
					<Button variant="ghost" size="sm" disabled={responding} onClick={reject}>
						拒绝
					</Button>
					<Button size="sm" disabled={responding} onClick={approve}>
						{responding ? "提交中..." : "确认变更"}
					</Button>
				</div>
			</div>
		</div>
	);
}
