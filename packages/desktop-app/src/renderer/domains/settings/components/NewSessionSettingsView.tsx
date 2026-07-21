import { SettingRow, SettingSection } from "@vetta/theme-ui/settings";
import { Switch } from "@vetta/ui";
import { SETTINGS_SECTION } from "../registry";
import type { NewSessionSettingsModel } from "./useNewSessionSettingsModel";

export function NewSessionSettingsView({ model }: { model: NewSessionSettingsModel }): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 pt-2 pb-4">
			<div className="mb-6">
				<h1 className="text-[20px] font-bold text-foreground">{model.labels.title}</h1>
				<p className="mt-1 text-[12px] text-muted-foreground">{model.labels.pageDescription}</p>
			</div>

			<SettingSection title={model.labels.sections.elements} section={SETTINGS_SECTION["new-session-elements"]}>
				<SettingRow title={model.labels.sceneCards} description={model.labels.sceneCardsDescription}>
					<Switch checked={model.visibility.showSceneCards} onCheckedChange={model.actions.toggleSceneCards} />
				</SettingRow>
				<SettingRow title={model.labels.skillBadges} description={model.labels.skillBadgesDescription}>
					<Switch checked={model.visibility.showSkillBadges} onCheckedChange={model.actions.toggleSkillBadges} />
				</SettingRow>
				<SettingRow
					title={model.labels.guidingWords}
					description={model.labels.guidingWordsDescription}
					border={false}
				>
					<Switch checked={model.visibility.showGuidingWords} onCheckedChange={model.actions.toggleGuidingWords} />
				</SettingRow>
			</SettingSection>
		</div>
	);
}
