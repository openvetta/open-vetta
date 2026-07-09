import { UpdateChecker } from "@shared/components/UpdateChecker";
import { Button } from "@shared/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/components/ui/select";
import { Switch } from "@shared/components/ui/switch";
import { SETTINGS_SECTION } from "../registry";
import { SettingRow, SettingSection } from "./shared";
import type { GeneralSettingsModel } from "./useGeneralSettingsModel";

export interface GeneralSettingsViewProps {
	model: GeneralSettingsModel;
}

export function GeneralSettingsView({ model }: GeneralSettingsViewProps): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-foreground">{model.labels.title}</h1>

			<SettingSection title={model.labels.sections.workspace} section={SETTINGS_SECTION["general-workspace"]}>
				<SettingRow
					title={model.labels.workspaceTitle}
					description={model.labels.workspaceDescription}
					border={false}
				>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => void model.actions.selectWorkspace()}
							className="flex items-center gap-2 rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent"
						>
							<span className="icon-[mdi--folder-outline] h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							<span className="max-w-[180px] truncate">{model.workspacePath}</span>
							<span className="icon-[mdi--chevron-down] h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						</button>
						<button
							type="button"
							onClick={() => void model.actions.resetWorkspace()}
							className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							title={model.labels.reset}
						>
							<span className="icon-[mdi--restore] h-3.5 w-3.5" />
						</button>
					</div>
				</SettingRow>
			</SettingSection>

			<SettingSection title={model.labels.sections.updates} section={SETTINGS_SECTION["general-updates"]}>
				<div className="px-5 py-4">
					<UpdateChecker />
				</div>
			</SettingSection>

			<SettingSection title={model.labels.sections.sandbox} section={SETTINGS_SECTION["general-sandbox"]}>
				<SettingRow
					title={model.labels.sandboxTitle}
					description={model.labels.sandboxDescription}
					border={false}
				>
					<Select
						value={model.executionMode}
						onValueChange={(value) => void model.actions.changeExecutionMode(value)}
					>
						<SelectTrigger
							size="sm"
							className="h-8 min-w-[120px] border-border/70 bg-background/50 text-[12px]"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="full-access" className="text-[12px]">
								{model.labels.fullAccess}
							</SelectItem>
							<SelectItem
								value="sandbox"
								className="text-[12px]"
								disabled={Boolean(model.sandboxUnavailableReason)}
								title={model.sandboxUnavailableReason ?? undefined}
							>
								{model.labels.useSandbox}
							</SelectItem>
						</SelectContent>
					</Select>
				</SettingRow>
			</SettingSection>

			<SettingSection title={model.labels.sections.notifications} section={SETTINGS_SECTION["general-notifications"]}>
				<SettingRow
					title={model.labels.systemNotifications}
					description={model.labels.systemNotificationsDescription}
					border={false}
				>
					<Switch checked={model.notificationsEnabled} onCheckedChange={model.actions.toggleNotifications} />
				</SettingRow>
			</SettingSection>

			<SettingSection title={model.labels.sections.developer} section={SETTINGS_SECTION["general-developer"]}>
				<SettingRow
					title={model.labels.debugMode}
					description={model.labels.debugModeDescription}
				>
					<Switch checked={model.debugMode} onCheckedChange={model.actions.toggleDebug} />
				</SettingRow>
				<SettingRow
					title={model.labels.exportDiagnostics}
					description={model.labels.exportDiagnosticsDescription}
					border={false}
				>
					<Button
						size="sm"
						variant="outline"
						disabled={model.exportingDiagnostics}
						onClick={() => void model.actions.exportDiagnostics()}
					>
						{model.exportingDiagnostics ? model.labels.exporting : model.labels.export}
					</Button>
				</SettingRow>
			</SettingSection>
		</div>
	);
}
