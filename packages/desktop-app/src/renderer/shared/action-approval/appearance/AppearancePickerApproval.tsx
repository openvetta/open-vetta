import type { DesktopActionApprovalRequest } from "@preload/api.js";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CursorStyle, ThemeMode } from "@shared/store/atoms";
import { cursorStyleAtom, themeModeAtom, themeNameAtom } from "@shared/store/atoms";
import { useThemeComponent } from "@vetta/theme-sdk";
import { AppearanceApprovalDrawerView } from "./AppearanceApprovalDrawerView";
import { AppearanceActionPicker } from "./AppearanceActionPicker";
import { useActionApproval, type ActiveActionApproval } from "../useActionApproval";

function isThemeSetInput(
	input: DesktopActionApprovalRequest["input"],
): input is {
	type: "set";
	mode?: ThemeMode;
	themeId?: string;
	cursorStyle?: CursorStyle;
	approvalUi?: string;
} {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
	const value = input as Record<string, unknown>;
	return (
		value.type === "set" &&
		(value.mode === undefined || value.mode === "light" || value.mode === "dark" || value.mode === "auto") &&
		(value.themeId === undefined || typeof value.themeId === "string") &&
		(value.cursorStyle === undefined || value.cursorStyle === "default" || value.cursorStyle === "stoat")
	);
}

function AppearancePickerDialog({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const { t } = useTranslation("common");
	const currentMode = useAtomValue(themeModeAtom);
	const currentThemeId = useAtomValue(themeNameAtom);
	const currentCursorStyle = useAtomValue(cursorStyleAtom);
	const input = isThemeSetInput(approval.request.input) ? approval.request.input : null;
	const [mode, setMode] = useState<ThemeMode>(input?.mode ?? currentMode);
	const [themeId, setThemeId] = useState(input?.themeId ?? currentThemeId);
	const [cursorStyle, setCursorStyle] = useState<CursorStyle>(input?.cursorStyle ?? currentCursorStyle);
	const { request, responding, error, approve, reject } = approval;
	const ThemedAppearanceApprovalDrawerView = useThemeComponent(
		"root.approval.appearanceDrawerView",
		AppearanceApprovalDrawerView,
	);

	return (
		<ThemedAppearanceApprovalDrawerView
			canConfirm={input !== null}
			countdown={approval.countdown.formatted}
			error={error}
			labels={{
				confirm: t("appearanceApproval.apply"),
				permission: t("actionApproval.permission", { permission: request.permission }),
				reject: t("actionApproval.reject"),
				responding: t("appearanceApproval.submitting"),
			}}
			onConfirm={() =>
				approve({
					type: "set",
					mode,
					themeId,
					cursorStyle,
					approvalUi: "appearance.picker",
				})
			}
			onReject={reject}
			responding={responding}
			summary={request.summary}
			title={t("appearanceApproval.pickerTitle")}
		>
			{input ? (
				<AppearanceActionPicker
					mode={mode}
					themeId={themeId}
					cursorStyle={cursorStyle}
					onModeChange={setMode}
					onThemeChange={setThemeId}
					onCursorStyleChange={setCursorStyle}
				/>
			) : (
				<pre className="max-h-[200px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/50 bg-background/50 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">
					{JSON.stringify(request.input, null, 2)}
				</pre>
			)}
		</ThemedAppearanceApprovalDrawerView>
	);
}

export function AppearancePickerApproval(): JSX.Element | null {
	const approval = useActionApproval("appearance.picker");
	if (!approval) return null;
	return <AppearancePickerDialog key={approval.request.approvalId} approval={approval} />;
}
