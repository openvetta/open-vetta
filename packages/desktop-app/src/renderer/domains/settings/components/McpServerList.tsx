import { useTranslation } from "react-i18next";
import { SettingSection } from "./shared";
import { McpServerForm } from "./McpServerForm";
import { McpServerRow } from "./McpServerRow";
import { SETTINGS_SECTION } from "../registry";
import type { McpSettingsModel } from "./useMcpSettingsModel";

export function McpServerList({ model }: { model: McpSettingsModel }): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<SettingSection section={SETTINGS_SECTION["mcp-server-list"]}>
			{model.serverNames.length === 0 && !model.addingServer && (
				<div className="px-5 py-8 text-center text-[12px] text-muted-foreground">{t("noServers")}</div>
			)}

			{model.serverNames.map((name) => (
				<McpServerRow key={name} name={name} model={model} />
			))}

			{model.addingServer && (
				<div className="border-t border-border px-5 py-4">
					<McpServerForm
						form={model.serverForm}
						setForm={model.setServerForm}
						onSave={() => void model.onAddServer()}
						onCancel={model.onCancelAddServer}
						saving={model.saving}
						saveLabel={t("addServer")}
					/>
				</div>
			)}
		</SettingSection>
	);
}
