import { useThemeComponent } from "@vetta-org/theme-sdk";
import { SettingsMenuTrigger } from "./SettingsMenuTrigger";
import { useSettingsMenuModel } from "./useSettingsMenuModel";

export function SettingsMenu(): JSX.Element {
	const model = useSettingsMenuModel();
	const ThemeSettingsMenuTrigger = useThemeComponent("sidebar.settingsTrigger", SettingsMenuTrigger);

	return (
		<div className="min-w-0 w-full">
			<ThemeSettingsMenuTrigger model={model} />
		</div>
	);
}
