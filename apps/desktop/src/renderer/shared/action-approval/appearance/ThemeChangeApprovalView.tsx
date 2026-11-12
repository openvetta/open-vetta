import { useThemeComponent } from "@vetta-org/theme-sdk";
import { ThemeChangeApprovalView as ThemeThemeChangeApprovalView } from "@vetta-org/theme-ui/action-approval/ThemeChangeApprovalView";
import { AppearanceActionPicker } from "./AppearanceActionPicker";
import { AppearanceApprovalDrawerView } from "./AppearanceApprovalDrawerView";
import type { ThemeChangeApprovalModel } from "./useThemeChangeApprovalModel";

export function ThemeChangeApprovalView(model: ThemeChangeApprovalModel): JSX.Element {
	const ThemedAppearanceApprovalDrawerView = useThemeComponent(
		"root.approval.appearanceDrawerView",
		AppearanceApprovalDrawerView,
	);

	return (
		<ThemeThemeChangeApprovalView
			Drawer={ThemedAppearanceApprovalDrawerView}
			drawerProps={model.drawer}
			hasInput={model.hasInput}
			rawInput={model.rawInput}
			picker={
				<AppearanceActionPicker
					mode={model.mode}
					themeId={model.themeId}
					onModeChange={model.onModeChange}
					onThemeChange={model.onThemeChange}
				/>
			}
		/>
	);
}
