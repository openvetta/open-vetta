import {
	PetActionGalleryView,
	PetSettingsView as ThemePetSettingsView,
} from "@vetta-org/theme-ui/settings";
import { SettingsAiAssist } from "../ai-assist";
import { SETTINGS_SECTION } from "../registry";
import type { PetSettingsModel } from "./usePetSettingsModel";

export function PetSettingsView({ model }: { model: PetSettingsModel }): JSX.Element {
	return (
		<ThemePetSettingsView
			labels={model.labels}
			sections={{
				display: SETTINGS_SECTION["pet-display"],
				behavior: SETTINGS_SECTION["pet-behavior"],
				actions: SETTINGS_SECTION["pet-actions"],
				decoration: SETTINGS_SECTION["pet-decoration"],
				developer: SETTINGS_SECTION["pet-developer"],
			}}
			enabled={model.config.enabled}
			alwaysOnTop={model.config.alwaysOnTop}
			autoMode={model.config.autoMode}
			debugFrame={model.config.debugFrame}
			size={model.size}
			actionGallery={
				<PetActionGalleryView
					groups={model.actionGroups}
					labels={model.actionLabels}
					playDisabled={!model.config.enabled}
					onPlay={model.actions.playAction}
				/>
			}
			decorations={model.decorations}
			// 装饰分区暂时隐藏；组件、数据与注册项均保留，恢复时改回 true 即可。
			showDecorationSection={false}
			aiAssistSlot={<SettingsAiAssist tabId="pet" />}
			onChangeEnabled={model.actions.changeEnabled}
			onChangeAlwaysOnTop={model.actions.changeAlwaysOnTop}
			onChangeAutoMode={model.actions.changeAutoMode}
			onChangeDebugFrame={model.actions.changeDebugFrame}
		/>
	);
}
