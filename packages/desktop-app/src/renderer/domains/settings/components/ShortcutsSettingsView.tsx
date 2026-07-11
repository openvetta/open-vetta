import { Button } from "@shared/components/ui/button";
import { SettingsAiAssist } from "../ai-assist";
import { SettingRow, SettingSection } from "./shared";
import { SETTINGS_SECTION } from "../registry";
import { QuickPanelSettingsSection } from "./QuickPanelSettingsSection";
import { ShortcutRecorder } from "./ShortcutRecorder";
import type { ShortcutsSettingsModel } from "./useShortcutsSettingsModel";

export function ShortcutsSettingsView({ model }: { model: ShortcutsSettingsModel }): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-[20px] font-bold text-foreground">{model.title}</h1>
				<div className="flex flex-wrap items-center gap-2">
					<SettingsAiAssist tabId="shortcuts" />
					<Button variant="secondary" size="sm" onClick={model.onResetAll}>
						<span className="icon-[mdi--restore] h-3.5 w-3.5" />
						{model.resetAllLabel}
					</Button>
				</div>
			</div>

			<SettingSection section={SETTINGS_SECTION["shortcuts-global"]}>
				{model.shortcutActions.map((action, idx) => (
					<SettingRow
						key={action.id}
						title={action.label}
						description={action.description}
						border={idx < model.shortcutActions.length - 1}
					>
						<ShortcutRecorder
							value={action.effectiveShortcut}
							onChange={(shortcut) => model.onShortcutChange(action.id, shortcut)}
							onReset={() => model.onShortcutReset(action.id)}
							isDefault={action.isDefault}
							placeholder={model.shortcutPlaceholder}
							resetLabel={model.resetLabel}
						/>
					</SettingRow>
				))}
			</SettingSection>

			<QuickPanelSettingsSection
				model={model.quickPanel}
				onTriggerChange={model.onQuickPanelTriggerChange}
				onBehaviorChange={model.onQuickPanelBehaviorChange}
			/>

			<p className="mt-4 text-[12px] leading-relaxed text-muted-foreground/50">{model.shortcutHint}</p>
		</div>
	);
}
