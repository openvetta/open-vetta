import type { JSX, ReactNode } from "react";
import { SettingRow, SettingSection, type SettingSectionMeta } from "./SettingChrome";

export interface ShortcutActionRowView {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly recorder: ReactNode;
}

export interface ShortcutsSettingsViewProps {
	readonly title: string;
	readonly resetAllLabel: string;
	readonly shortcutHint: string;
	readonly globalSection: SettingSectionMeta;
	readonly headerTrailing: ReactNode;
	readonly shortcutActions: readonly ShortcutActionRowView[];
	readonly quickPanelSection: ReactNode;
}

export function ShortcutsSettingsView({
	title,
	shortcutHint,
	globalSection,
	headerTrailing,
	shortcutActions,
	quickPanelSection,
}: ShortcutsSettingsViewProps): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-[20px] font-bold text-foreground">{title}</h1>
				<div className="flex flex-wrap items-center gap-2">{headerTrailing}</div>
			</div>

			<SettingSection section={globalSection}>
				{shortcutActions.map((action, idx) => (
					<SettingRow
						key={action.id}
						title={action.label}
						description={action.description}
						border={idx < shortcutActions.length - 1}
					>
						{action.recorder}
					</SettingRow>
				))}
			</SettingSection>

			{quickPanelSection}

			<p className="mt-4 text-[12px] leading-relaxed text-muted-foreground/50">{shortcutHint}</p>
		</div>
	);
}
