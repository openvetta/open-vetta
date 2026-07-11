import type { DesktopActionApprovalRequest } from "@preload/api.js";
import { cursorStyleAtom, themeModeAtom, themeNameAtom, type CursorStyle, type ThemeMode } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useThemeComponent } from "@vetta/theme-sdk";
import { AppearanceApprovalDrawerView } from "./AppearanceApprovalDrawerView";
import { AppearanceActionPicker } from "./AppearanceActionPicker";
import { useActionApproval } from "../useActionApproval";

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

export function ThemeChangeApproval(): JSX.Element | null {
	const approval = useActionApproval("appearance.theme-change");
	const currentMode = useAtomValue(themeModeAtom);
	const currentThemeId = useAtomValue(themeNameAtom);
	const currentCursorStyle = useAtomValue(cursorStyleAtom);
	if (!approval) return null;
	return (
		<ThemeChangeDrawer
			key={approval.request.approvalId}
			approval={approval}
			currentMode={currentMode}
			currentThemeId={currentThemeId}
			currentCursorStyle={currentCursorStyle}
		/>
	);
}

function ThemeChangeDrawer({
	approval,
	currentMode,
	currentThemeId,
	currentCursorStyle,
}: {
	approval: NonNullable<ReturnType<typeof useActionApproval>>;
	currentMode: ThemeMode;
	currentThemeId: string;
	currentCursorStyle: CursorStyle;
}): JSX.Element {
	const { t } = useTranslation("common");
	const { request, responding, error, approve, reject } = approval;
	const input = isThemeSetInput(request.input) ? request.input : null;
	const [mode, setMode] = useState<ThemeMode>(input?.mode ?? currentMode);
	const [themeId, setThemeId] = useState(input?.themeId ?? currentThemeId);
	const [cursorStyle, setCursorStyle] = useState<CursorStyle>(input?.cursorStyle ?? currentCursorStyle);
	const ThemedAppearanceApprovalDrawerView = useThemeComponent(
		"root.approval.appearanceDrawerView",
		AppearanceApprovalDrawerView,
	);

	return (
		<ThemedAppearanceApprovalDrawerView
			canConfirm={!!input}
			countdown={approval.countdown.formatted}
			error={error}
			labels={{
				confirm: t("appearanceApproval.confirmChange"),
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
					approvalUi: input?.approvalUi ?? "appearance.theme-change",
				})
			}
			onReject={reject}
			responding={responding}
			summary={request.summary}
			title={t("appearanceApproval.themeChangeTitle")}
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
				<pre className="max-h-[200px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/50 bg-background/50 p-3 font-mono text-[11px] leading-5 text-foreground">
					{JSON.stringify(request.input, null, 2)}
				</pre>
			)}
		</ThemedAppearanceApprovalDrawerView>
	);
}
