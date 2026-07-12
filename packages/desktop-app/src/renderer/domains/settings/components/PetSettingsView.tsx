import {
	PetSettingsView as ThemePetSettingsView,
} from "@vetta/theme-ui/settings";
import { SettingsAiAssist } from "../ai-assist";
import { SETTINGS_SECTION } from "../registry";
import { PetBubbleStylePreview } from "./PetBubbleStylePreview";
import type { PetSettingsModel } from "./usePetSettingsModel";

export function PetSettingsView({ model }: { model: PetSettingsModel }): JSX.Element {
	return (
		<ThemePetSettingsView
			labels={model.labels}
			sections={{
				status: SETTINGS_SECTION["pet-status"],
				window: SETTINGS_SECTION["pet-window"],
				decoration: SETTINGS_SECTION["pet-decoration"],
				bubble: SETTINGS_SECTION["pet-bubble"],
				developer: SETTINGS_SECTION["pet-developer"],
			}}
			enabled={model.config.enabled}
			alwaysOnTop={model.config.alwaysOnTop}
			debugFrame={model.config.debugFrame}
			decorations={model.decorations}
			aiAssistSlot={<SettingsAiAssist tabId="pet" />}
			bubbleGrid={
				<div className="grid grid-cols-2 gap-3 p-4">
					{model.bubbleStyles.map((style) => (
						<PetBubbleStylePreview
							key={style.id}
							decorUrl={style.decorUrl}
							description={style.description}
							disabled={!model.config.enabled}
							label={style.label}
							onSelect={model.actions.changeBubbleStyle}
							selected={model.config.bubbleStyleId === style.id}
							styleId={style.id}
						/>
					))}
				</div>
			}
			onChangeEnabled={model.actions.changeEnabled}
			onChangeAlwaysOnTop={model.actions.changeAlwaysOnTop}
			onChangeDebugFrame={model.actions.changeDebugFrame}
		/>
	);
}
