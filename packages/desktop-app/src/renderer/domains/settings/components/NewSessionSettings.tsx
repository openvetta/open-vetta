import { NewSessionSettingsView } from "./NewSessionSettingsView";
import { useNewSessionSettingsModel } from "./useNewSessionSettingsModel";

export function NewSessionSettings(): JSX.Element {
	const model = useNewSessionSettingsModel();
	return <NewSessionSettingsView model={model} />;
}
