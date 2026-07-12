import { UpdateChecker } from "@shared/components/UpdateChecker";
import { Button } from "@shared/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/components/ui/select";
import { Switch } from "@shared/components/ui/switch";
import { GeneralSettingsView as ThemeGeneralSettingsView } from "@vetta/theme-ui/settings";
import { SETTINGS_SECTION } from "../registry";
import type { GeneralSettingsModel } from "./useGeneralSettingsModel";

export interface GeneralSettingsViewProps {
	model: GeneralSettingsModel;
}

export function GeneralSettingsView({ model }: GeneralSettingsViewProps): JSX.Element {
	return (
		<ThemeGeneralSettingsView
			labels={model.labels}
			sections={{
				workspace: SETTINGS_SECTION["general-workspace"],
				updates: SETTINGS_SECTION["general-updates"],
				sandbox: SETTINGS_SECTION["general-sandbox"],
				notifications: SETTINGS_SECTION["general-notifications"],
				developer: SETTINGS_SECTION["general-developer"],
			}}
			workspaceControl={
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
			}
			updatesSlot={<UpdateChecker />}
			sandboxControl={
				<Select value={model.executionMode} onValueChange={(value) => void model.actions.changeExecutionMode(value)}>
					<SelectTrigger size="sm" className="h-8 min-w-[120px] border-border/70 bg-background/50 text-[12px]">
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
			}
			notificationsControl={
				<Switch checked={model.notificationsEnabled} onCheckedChange={model.actions.toggleNotifications} />
			}
			debugControl={<Switch checked={model.debugMode} onCheckedChange={model.actions.toggleDebug} />}
			exportControl={
				<Button
					size="sm"
					variant="outline"
					disabled={model.exportingDiagnostics}
					onClick={() => void model.actions.exportDiagnostics()}
				>
					{model.exportingDiagnostics ? model.labels.exporting : model.labels.export}
				</Button>
			}
		/>
	);
}
