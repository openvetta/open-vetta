import { McpSettingsView } from "./McpSettingsView";
import { useMcpSettingsModel } from "./useMcpSettingsModel";
export { CheckboxField, TextareaField } from "./SettingsFormFields";

export function McpSettings(): JSX.Element {
	const model = useMcpSettingsModel();
	return <McpSettingsView model={model} />;
}
