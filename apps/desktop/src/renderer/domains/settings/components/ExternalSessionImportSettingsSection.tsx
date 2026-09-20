import { Button } from "@shared/components/ui/button";
import { SettingRow, SettingSection } from "@vetta-org/theme-ui/settings";
import { Switch } from "@vetta-org/ui";
import { SETTINGS_SECTION } from "../registry";
import type { ExternalSessionImportSettingsModel } from "./useExternalSessionImportSettingsModel";

export function ExternalSessionImportSettingsSection({
	model,
}: {
	model: ExternalSessionImportSettingsModel;
}): JSX.Element {
	return (
		<div className="mt-6">
			<SettingSection
				title={model.labels.title}
				section={SETTINGS_SECTION["agent-session-import"]}
				description={model.labels.description}
			>
				{model.tools.map((tool, index) => (
					<div key={tool.id}>
						<SettingRow title={tool.labels.name} description={tool.labels.pathDescription} border={tool.canSpecifyPath}>
							<Switch
								checked={tool.enabled}
								onCheckedChange={(checked) => model.actions.toggleEnabled(tool.id, checked)}
								aria-label={tool.labels.name}
							/>
						</SettingRow>
						{tool.canSpecifyPath ? (
							<SettingRow title={model.labels.specifyPath} border={index < model.tools.length - 1}>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => void model.actions.specifySessionDir(tool.id)}
								>
									{model.labels.specifyPath}
								</Button>
							</SettingRow>
						) : null}
					</div>
				))}
			</SettingSection>
		</div>
	);
}
