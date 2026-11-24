import { LauncherSettingsView } from "@vetta-org/theme-ui/settings";
import { useLauncherSettingsModel } from "./useLauncherSettingsModel";

export function LauncherSettings(): JSX.Element {
	const model = useLauncherSettingsModel();
	return <LauncherSettingsView {...model} />;
}
