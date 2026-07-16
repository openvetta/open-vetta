import type { JSX, ReactNode } from "react";
import {
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Switch,
} from "@vetta/ui";
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
	readonly fullAccess: string;
	readonly useSandbox: string;
	readonly export: string;
	readonly exporting: string;
	readonly reset: string;
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
	readonly workspacePath: string;
	readonly onSelectWorkspace: () => void;
	readonly onResetWorkspace: () => void;
	readonly updatesSlot: ReactNode;
	readonly executionMode: string;
	readonly onExecutionModeChange: (mode: string) => void;
	readonly sandboxUnavailableReason: string | null;
	readonly notificationsEnabled: boolean;
	readonly onNotificationsChange: (checked: boolean) => void;
	readonly debugMode: boolean;
	readonly onDebugChange: (checked: boolean) => void;
	readonly exportingDiagnostics: boolean;
	readonly onExportDiagnostics: () => void;
}

/**
 * Settings general page layout. Host chrome uses `@vetta/ui` primitives (not desktop components/ui).
 * UpdateChecker stays host-injected (desktop-connected).
 */
export function GeneralSettingsView({
	labels,
	sections,
	workspacePath,
	onSelectWorkspace,
	onResetWorkspace,
	updatesSlot,
	executionMode,
	onExecutionModeChange,
	sandboxUnavailableReason,
	notificationsEnabled,
	onNotificationsChange,
	debugMode,
	onDebugChange,
	exportingDiagnostics,
	onExportDiagnostics,
}: GeneralSettingsViewProps): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 pt-2 pb-4">
			<h1 className="mb-6 text-[20px] font-bold text-foreground">{labels.title}</h1>

			<SettingSection title={labels.sections.workspace} section={sections.workspace}>
				<SettingRow title={labels.workspaceTitle} description={labels.workspaceDescription} border={false}>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={onSelectWorkspace}
							className="flex items-center gap-2 rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent"
						>
							<span className="icon-[mdi--folder-outline] h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							<span className="max-w-[180px] truncate">{workspacePath}</span>
							<span className="icon-[mdi--chevron-down] h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						</button>
						<button
							type="button"
							onClick={onResetWorkspace}
							className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							title={labels.reset}
						>
							<span className="icon-[mdi--restore] h-3.5 w-3.5" />
						</button>
					</div>
				</SettingRow>
			</SettingSection>

			<SettingSection title={labels.sections.updates} section={sections.updates}>
				<div className="px-5 py-4">{updatesSlot}</div>
			</SettingSection>

			<SettingSection title={labels.sections.sandbox} section={sections.sandbox}>
				<SettingRow title={labels.sandboxTitle} description={labels.sandboxDescription} border={false}>
					<Select value={executionMode} onValueChange={onExecutionModeChange}>
						<SelectTrigger size="sm" className="h-8 min-w-[120px] border-border/70 bg-background/50 text-[12px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="full-access" className="text-[12px]">
								{labels.fullAccess}
							</SelectItem>
							<SelectItem
								value="sandbox"
								className="text-[12px]"
								disabled={Boolean(sandboxUnavailableReason)}
								title={sandboxUnavailableReason ?? undefined}
							>
								{labels.useSandbox}
							</SelectItem>
						</SelectContent>
					</Select>
				</SettingRow>
			</SettingSection>

			<SettingSection title={labels.sections.notifications} section={sections.notifications}>
				<SettingRow
					title={labels.systemNotifications}
					description={labels.systemNotificationsDescription}
					border={false}
				>
					<Switch checked={notificationsEnabled} onCheckedChange={onNotificationsChange} />
				</SettingRow>
			</SettingSection>

			<SettingSection title={labels.sections.developer} section={sections.developer}>
				<SettingRow title={labels.debugMode} description={labels.debugModeDescription}>
					<Switch checked={debugMode} onCheckedChange={onDebugChange} />
				</SettingRow>
				<SettingRow
					title={labels.exportDiagnostics}
					description={labels.exportDiagnosticsDescription}
					border={false}
				>
					<Button size="sm" variant="outline" disabled={exportingDiagnostics} onClick={onExportDiagnostics}>
						{exportingDiagnostics ? labels.exporting : labels.export}
					</Button>
				</SettingRow>
			</SettingSection>
		</div>
	);
}
