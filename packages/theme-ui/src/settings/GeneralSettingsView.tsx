import type { JSX, ReactNode } from "react";
import { SettingRow, SettingSection, type SettingSectionMeta } from "./SettingChrome";

export interface GeneralSettingsViewLabels {
	readonly title: string;
	readonly sections: {
		readonly workspace: string;
		readonly updates: string;
		readonly sandbox: string;
		readonly notifications: string;
		readonly developer: string;
	};
	readonly workspaceTitle: string;
	readonly workspaceDescription: string;
	readonly sandboxTitle: string;
	readonly sandboxDescription: string;
	readonly systemNotifications: string;
	readonly systemNotificationsDescription: string;
	readonly debugMode: string;
	readonly debugModeDescription: string;
	readonly exportDiagnostics: string;
	readonly exportDiagnosticsDescription: string;
}

export interface GeneralSettingsViewProps {
	readonly labels: GeneralSettingsViewLabels;
	readonly sections: {
		readonly workspace: SettingSectionMeta;
		readonly updates: SettingSectionMeta;
		readonly sandbox: SettingSectionMeta;
		readonly notifications: SettingSectionMeta;
		readonly developer: SettingSectionMeta;
	};
	readonly workspaceControl: ReactNode;
	readonly updatesSlot: ReactNode;
	readonly sandboxControl: ReactNode;
	readonly notificationsControl: ReactNode;
	readonly debugControl: ReactNode;
	readonly exportControl: ReactNode;
}

export function GeneralSettingsView({
	labels,
	sections,
	workspaceControl,
	updatesSlot,
	sandboxControl,
	notificationsControl,
	debugControl,
	exportControl,
}: GeneralSettingsViewProps): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-foreground">{labels.title}</h1>

			<SettingSection title={labels.sections.workspace} section={sections.workspace}>
				<SettingRow title={labels.workspaceTitle} description={labels.workspaceDescription} border={false}>
					{workspaceControl}
				</SettingRow>
			</SettingSection>

			<SettingSection title={labels.sections.updates} section={sections.updates}>
				<div className="px-5 py-4">{updatesSlot}</div>
			</SettingSection>

			<SettingSection title={labels.sections.sandbox} section={sections.sandbox}>
				<SettingRow title={labels.sandboxTitle} description={labels.sandboxDescription} border={false}>
					{sandboxControl}
				</SettingRow>
			</SettingSection>

			<SettingSection title={labels.sections.notifications} section={sections.notifications}>
				<SettingRow
					title={labels.systemNotifications}
					description={labels.systemNotificationsDescription}
					border={false}
				>
					{notificationsControl}
				</SettingRow>
			</SettingSection>

			<SettingSection title={labels.sections.developer} section={sections.developer}>
				<SettingRow title={labels.debugMode} description={labels.debugModeDescription}>
					{debugControl}
				</SettingRow>
				<SettingRow
					title={labels.exportDiagnostics}
					description={labels.exportDiagnosticsDescription}
					border={false}
				>
					{exportControl}
				</SettingRow>
			</SettingSection>
		</div>
	);
}
