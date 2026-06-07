import type { DesktopActionApprovalRequest } from "@preload/api.js";
import { useAtomValue } from "jotai";
import { useState } from "react";
import type { ThemeMode } from "@shared/store/atoms";
import { themeModeAtom, themeNameAtom } from "@shared/store/atoms";
import { Button } from "../components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "../components/ui/drawer";
import { AppearanceActionPicker } from "./AppearanceActionPicker";
import { useActionApproval, type ActiveActionApproval } from "./useActionApproval";
import { useApprovalCountdown } from "./useApprovalCountdown";

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
	const countdown = useApprovalCountdown(approval.request.approvalId);
	const { request, responding, error, approve, reject } = approval;

	return (
		<Drawer open direction="right" dismissible={false}>
			<DrawerContent className="w-[min(520px,calc(100vw-2rem))] sm:max-w-[520px]">
				<DrawerHeader className="border-b border-border/60">
					<DrawerTitle>选择应用主题</DrawerTitle>
					<DrawerDescription>{request.summary}</DrawerDescription>
				</DrawerHeader>
				<div className="min-h-0 flex-1 overflow-y-auto p-4">
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
				</div>
				<DrawerFooter className="border-t border-border/60">
					<Button variant="outline" size="sm" disabled={responding} onClick={reject}>
						拒绝（{countdown}）
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
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}

export function AppearancePickerApproval(): JSX.Element | null {
	const approval = useActionApproval("appearance.picker");
	if (!approval) return null;
	return <AppearancePickerDialog key={approval.request.approvalId} approval={approval} />;
}
