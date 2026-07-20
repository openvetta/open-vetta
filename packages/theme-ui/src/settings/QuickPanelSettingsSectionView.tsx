import type { JSX } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@vetta/ui";
import { cn } from "@vetta/ui";
import { SettingRow, SettingSection, type SettingSectionMeta } from "./SettingChrome";

export interface QuickPanelOptionView {
	readonly value: string;
	readonly label: string;
}

export interface QuickPanelSettingsSectionViewProps {
	readonly section: SettingSectionMeta;
	readonly sectionTitle?: string;
	readonly triggerTitle: string;
	readonly triggerDescription: string;
	readonly trigger: string;
	readonly triggerOptions: readonly QuickPanelOptionView[];
	readonly onTriggerChange: (value: string) => void;
	readonly behaviorTitle: string;
	readonly behaviorDescription: string;
	readonly behavior: string;
	readonly behaviorOptions: readonly QuickPanelOptionView[];
	readonly onBehaviorChange: (value: string) => void;
	readonly behaviorDisabled: boolean;
}

export function QuickPanelSettingsSectionView({
	section,
	sectionTitle,
	triggerTitle,
	triggerDescription,
	trigger,
	triggerOptions,
	onTriggerChange,
	behaviorTitle,
	behaviorDescription,
	behavior,
	behaviorOptions,
	onBehaviorChange,
	behaviorDisabled,
}: QuickPanelSettingsSectionViewProps): JSX.Element {
	return (
		<SettingSection section={section} title={sectionTitle}>
			<SettingRow title={triggerTitle} description={triggerDescription}>
				<Select value={trigger} onValueChange={onTriggerChange}>
					<SelectTrigger size="sm" className="h-8 min-w-[150px] border-border/70 bg-background/50 text-[12px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{triggerOptions.map((option) => (
							<SelectItem key={option.value} value={option.value} className="text-[12px]">
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</SettingRow>

			<SettingRow title={behaviorTitle} description={behaviorDescription} border={false}>
				<div className={cn("transition-opacity", behaviorDisabled && "pointer-events-none opacity-40")}>
					<Select value={behavior} onValueChange={onBehaviorChange}>
						<SelectTrigger size="sm" className="h-8 min-w-[120px] border-border/70 bg-background/50 text-[12px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{behaviorOptions.map((option) => (
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
