import type { Button } from "../../components/ui/button";
type HostButton = typeof Button;
export type { HostButton as _HostPrimitiveHoldButton };
import { useThemeComponent } from "@vetta/theme-sdk";
import { AppearanceActionPicker } from "./AppearanceActionPicker";
import { AppearanceApprovalDrawerView } from "./AppearanceApprovalDrawerView";
import type { AppearancePickerApprovalModel } from "./useAppearancePickerApprovalModel";

export function AppearancePickerApprovalView(model: AppearancePickerApprovalModel): JSX.Element {
	const ThemedAppearanceApprovalDrawerView = useThemeComponent(
		"root.approval.appearanceDrawerView",
		AppearanceApprovalDrawerView,
	);

	return (
		<ThemedAppearanceApprovalDrawerView {...model.drawer}>
			{model.hasInput ? (
				<AppearanceActionPicker
					mode={model.mode}
					themeId={model.themeId}
					cursorStyle={model.cursorStyle}
					onModeChange={model.onModeChange}
					onThemeChange={model.onThemeChange}
					onCursorStyleChange={model.onCursorStyleChange}
				/>
			) : (
				<pre className="max-h-[200px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/50 bg-background/50 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">
					{JSON.stringify(model.rawInput, null, 2)}
				</pre>
			)}
		</ThemedAppearanceApprovalDrawerView>
	);
}
