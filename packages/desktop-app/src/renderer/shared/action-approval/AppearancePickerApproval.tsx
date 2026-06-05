import type { DesktopActionApprovalRequest } from "@preload/api.js";
import { useAtomValue } from "jotai";
import { useState } from "react";
import type { ThemeMode } from "@shared/store/atoms";
import { themeModeAtom, themeNameAtom } from "@shared/store/atoms";
import { Button } from "../components/ui/button";
import { AppearanceActionPicker } from "./AppearanceActionPicker";
import { useActionApproval, type ActiveActionApproval } from "./useActionApproval";

function isThemeSetInput(
	input: DesktopActionApprovalRequest["input"],
): input is { type: "set"; mode?: ThemeMode; themeId?: string; approvalUi?: string } {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
	const value = input as Record<string, unknown>;
	return (
		value.type === "set" &&
		(value.mode === undefined || value.mode === "light" || value.mode === "dark" || value.mode === "auto") &&
		(value.themeId === undefined || typeof value.themeId === "string")
	);
}

function AppearancePickerDialog({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const currentMode = useAtomValue(themeModeAtom);
	const currentThemeId = useAtomValue(themeNameAtom);
	const input = isThemeSetInput(approval.request.input) ? approval.request.input : null;
	const [mode, setMode] = useState<ThemeMode>(input?.mode ?? currentMode);
	const [themeId, setThemeId] = useState(input?.themeId ?? currentThemeId);
	const { request, responding, error, approve, reject } = approval;

	return (
		<div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/50 px-4 backdrop-blur-sm">
			<div className="max-h-[90vh] w-full max-w-[560px] overflow-auto rounded-xl border border-border bg-popover p-5 shadow-lg">
				<div className="mb-4">
					<h2 className="text-[15px] font-semibold text-foreground">选择应用主题</h2>
					<p className="mt-1 text-[12px] leading-5 text-muted-foreground">{request.summary}</p>
				</div>

				{input ? (
					<AppearanceActionPicker
						mode={mode}
						themeId={themeId}
						onModeChange={setMode}
						onThemeChange={setThemeId}
					/>
				) : (
					<pre className="max-h-[200px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/50 bg-background/50 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">
						{JSON.stringify(request.input, null, 2)}
					</pre>
				)}

				<div className="mt-4 text-[11px] text-muted-foreground">权限：{request.permission}</div>
				{error && <div className="mt-2 text-[11px] text-destructive">{error}</div>}

				<div className="mt-4 flex justify-end gap-2">
					<Button variant="ghost" size="sm" disabled={responding} onClick={reject}>
						拒绝
					</Button>
					<Button
						size="sm"
						disabled={responding || input === null}
						onClick={() =>
							approve({
								type: "set",
								mode,
								themeId,
								approvalUi: "appearance.picker",
							})
						}
					>
						{responding ? "提交中..." : "应用主题"}
					</Button>
				</div>
			</div>
		</div>
	);
}

export function AppearancePickerApproval(): JSX.Element | null {
	const approval = useActionApproval("appearance.picker");
	if (!approval) return null;
	return <AppearancePickerDialog key={approval.request.approvalId} approval={approval} />;
}
