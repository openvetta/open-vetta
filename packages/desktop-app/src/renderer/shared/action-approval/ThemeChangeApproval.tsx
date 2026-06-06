import type { DesktopActionApprovalRequest } from "@preload/api.js";
import { themeModeAtom, themeNameAtom, type ThemeMode } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { Button } from "../components/ui/button";
import { ActionApprovalDrawer } from "./ActionApprovalSurface";
import { AppearanceActionPicker } from "./AppearanceActionPicker";
import { useActionApproval } from "./useActionApproval";
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

export function ThemeChangeApproval(): JSX.Element | null {
	const approval = useActionApproval("appearance.theme-change");
	const currentMode = useAtomValue(themeModeAtom);
	const currentThemeId = useAtomValue(themeNameAtom);
	if (!approval) return null;
	return (
		<ThemeChangeDrawer
			key={approval.request.approvalId}
			approval={approval}
			currentMode={currentMode}
			currentThemeId={currentThemeId}
		/>
	);
}

function ThemeChangeDrawer({
	approval,
	currentMode,
	currentThemeId,
}: {
	approval: NonNullable<ReturnType<typeof useActionApproval>>;
	currentMode: ThemeMode;
	currentThemeId: string;
}): JSX.Element {
	const { request, responding, error, approve, reject } = approval;
	const countdown = useApprovalCountdown();
	const input = isThemeSetInput(request.input) ? request.input : null;
	const [mode, setMode] = useState<ThemeMode>(input?.mode ?? currentMode);
	const [themeId, setThemeId] = useState(input?.themeId ?? currentThemeId);

	return (
		<ActionApprovalDrawer
			title="编辑主题变更"
			description={request.summary}
			footer={
			<>
				<Button variant="ghost" size="sm" disabled={responding} onClick={reject}>
					拒绝（{countdown}）
				</Button>
				<Button
					size="sm"
					disabled={responding || !input}
					onClick={() =>
						approve({
							type: "set",
							mode,
							themeId,
							approvalUi: input?.approvalUi ?? "appearance.theme-change",
						})
					}
				>
					{responding ? "提交中..." : "确认变更"}
				</Button>
			</>
			}
		>
			{input ? (
				<AppearanceActionPicker
					mode={mode}
					themeId={themeId}
					onModeChange={setMode}
					onThemeChange={setThemeId}
				/>
			) : (
				<pre className="max-h-[200px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/50 bg-background/50 p-3 font-mono text-[11px] leading-5 text-foreground">
					{JSON.stringify(request.input, null, 2)}
				</pre>
			)}
			<div className="mt-4 text-[11px] text-muted-foreground">权限：{request.permission}</div>
			{error && <div className="mt-2 text-[11px] text-destructive">{error}</div>}
		</ActionApprovalDrawer>
	);
}
