import { Button } from "@shared/components/ui/button";
import { McpJsonEditorView } from "@vetta/theme-ui/settings";
import { useTranslation } from "react-i18next";
import { SETTINGS_SECTION } from "../registry";
import type { McpSettingsModel } from "./useMcpSettingsModel";

export function McpJsonEditor({ model }: { model: McpSettingsModel }): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<McpJsonEditorView
			section={SETTINGS_SECTION["mcp-json"]}
			jsonText={model.jsonText}
			onJsonTextChange={(value) => {
				model.setJsonText(value);
				model.clearJsonError();
			}}
			jsonError={model.jsonError}
			configPathHint={`${t("configFilePath")}: ~/.vetta/agent/mcp.json`}
			placeholder='{ "mcpServers": {} }'
			saveControl={
				<Button variant="primary" size="sm" onClick={() => void model.onJsonSave()} disabled={model.saving}>
					{model.saving ? t("saving") : t("save")}
				</Button>
			}
		/>
	);
}
