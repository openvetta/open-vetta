import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/components/ui/select";
import { cn } from "@shared/lib/utils";
import { SettingRow, SettingSection } from "./shared";
import { SETTINGS_SECTION } from "../registry";
import type { QuickPanelBehavior, QuickPanelTrigger, ShortcutsSettingsModel } from "./useShortcutsSettingsModel";

type QuickPanelModel = ShortcutsSettingsModel["quickPanel"];

export function QuickPanelSettingsSection({
	model,
	onTriggerChange,
	onBehaviorChange,
}: {
	model: QuickPanelModel;
	onTriggerChange: (trigger: QuickPanelTrigger) => void;
	onBehaviorChange: (behavior: QuickPanelBehavior) => void;
}): JSX.Element {
	return (
		<SettingSection section={SETTINGS_SECTION["shortcuts-quickpanel"]}>
			<SettingRow title={model.triggerTitle} description={model.triggerDescription}>
				<Select value={model.trigger} onValueChange={(value) => onTriggerChange(value as QuickPanelTrigger)}>
					<SelectTrigger size="sm" className="h-8 min-w-[150px] border-border/70 bg-background/50 text-[12px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{model.triggerOptions.map((option) => (
							<SelectItem key={option.value} value={option.value} className="text-[12px]">
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</SettingRow>

			<SettingRow title={model.behaviorTitle} description={model.behaviorDescription} border={false}>
				<div className={cn("transition-opacity", model.behaviorDisabled && "pointer-events-none opacity-40")}>
					<Select value={model.behavior} onValueChange={(value) => onBehaviorChange(value as QuickPanelBehavior)}>
						<SelectTrigger size="sm" className="h-8 min-w-[120px] border-border/70 bg-background/50 text-[12px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{model.behaviorOptions.map((option) => (
								<SelectItem key={option.value} value={option.value} className="text-[12px]">
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</SettingRow>
		</SettingSection>
	);
}
