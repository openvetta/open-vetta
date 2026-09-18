import { AgentSettingsView } from "./AgentSettingsView";
import { useImageGenerationSettingsModel } from "./useImageGenerationSettingsModel";
import { useAgentSettingsModel } from "./useAgentSettingsModel";
import { useExternalSessionImportSettingsModel } from "./useExternalSessionImportSettingsModel";
import { useRuntimeConfigurationModel } from "./useRuntimeConfigurationModel";

export function AgentSettings(): JSX.Element {
	return (
		<AgentSettingsView
			model={useAgentSettingsModel()}
			imageGeneration={useImageGenerationSettingsModel()}
			sessionImport={useExternalSessionImportSettingsModel()}
			runtimeConfiguration={useRuntimeConfigurationModel()}
		/>
	);
}
