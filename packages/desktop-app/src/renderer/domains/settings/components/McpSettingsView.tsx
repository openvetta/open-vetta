import { useTranslation } from "react-i18next";
import { SettingsPageShellView } from "@vetta/theme-ui/settings";
import { SettingsAiAssist } from "../ai-assist";
import { BuiltinMcpSecretsDialog } from "./BuiltinMcpSecretsDialog";
import { McpDiscoverSection, McpInstalledList } from "./McpServerList";
import type { McpSettingsModel } from "./useMcpSettingsModel";

export function McpSettingsView({ model }: { model: McpSettingsModel }): JSX.Element {
	const { t } = useTranslation("settings");

	return (
		<SettingsPageShellView
			title={t("mcpTitle")}
			description={t("mcpDescription")}
			headerAction={model.config ? <SettingsAiAssist tabId="mcp" /> : undefined}
			loading={!model.config}
			loadingLabel={t("loading")}
			pb
		>
			{model.config && (
				<>
					<McpInstalledList model={model} />
					<McpDiscoverSection model={model} />
					<BuiltinMcpSecretsDialog
						open={model.secretsDialogPreset !== null}
						preset={model.secretsDialogPreset}
						initialValues={model.secretsDialogInitial}
						saving={model.saving || model.busyPresetName !== null}
						allowDefer={model.secretsDialogMode === "add"}
						onOpenChange={(open) => {
							if (!open) model.onCloseSecretsDialog();
						}}
						onConfirm={(values) => void model.onConfirmSecretsDialog(values)}
						onDefer={() => void model.onConfirmSecretsDialog({})}
					/>
				</>
			)}
		</SettingsPageShellView>
	);
}
