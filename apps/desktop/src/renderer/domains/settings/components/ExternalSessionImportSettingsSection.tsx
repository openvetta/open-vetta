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
				<SettingRow
					title={model.labels.grok}
					description={model.labels.pathDescription}
					border={model.canSpecifyGrokPath}
				>
					<Switch
						checked={model.grokEnabled}
						onCheckedChange={model.actions.toggleGrokEnabled}
						aria-label={model.labels.grok}
					/>
				</SettingRow>
				{model.canSpecifyGrokPath && (
					<SettingRow title={model.labels.specifyPath} border={false}>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => void model.actions.specifyGrokSessionDir()}
						>
							{model.labels.specifyPath}
						</Button>
					</SettingRow>
				)}
			</SettingSection>
		</div>
	);
}
