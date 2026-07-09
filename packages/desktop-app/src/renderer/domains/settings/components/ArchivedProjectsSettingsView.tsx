import { Button } from "@shared/components/ui/button";
import { SETTINGS_SECTION } from "../registry";
import { SettingSection } from "./shared";
import type { ArchivedProjectsSettingsModel } from "./useArchivedProjectsSettingsModel";

export interface ArchivedProjectsSettingsViewProps {
	model: ArchivedProjectsSettingsModel;
}

export function ArchivedProjectsSettingsView({ model }: ArchivedProjectsSettingsViewProps): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-foreground">{model.labels.title}</h1>

			{model.projects.length === 0 ? (
				<div className="flex flex-col items-center gap-2.5 py-16 text-center">
					<span className="icon-[mdi--archive-off-outline] h-8 w-8 text-muted-foreground" />
					<p className="text-[13px] text-muted-foreground">{model.labels.empty}</p>
				</div>
			) : (
				<SettingSection title={model.labels.sectionTitle} section={SETTINGS_SECTION["archived-list"]}>
					{model.projects.map((entry) => (
						<div
							key={entry.path}
							className="flex items-center gap-3 border-b border-border px-5 py-3.5 last:border-b-0"
						>
							<span className="icon-[mdi--folder-outline] h-4 w-4 shrink-0 text-muted-foreground" />
							<div className="min-w-0 flex-1">
								<div className="text-[13px] font-medium text-foreground">{entry.name}</div>
								<div className="mt-0.5 truncate text-[11px] text-muted-foreground">{entry.path}</div>
							</div>
							<div className="flex items-center gap-1">
								<Button
									variant="ghost"
									size="xs"
									onClick={() => void model.actions.unarchive(entry.path)}
									title={model.labels.unarchive}
								>
									<span className="icon-[mdi--archive-arrow-up-outline] h-3.5 w-3.5" />
									{model.labels.unarchive}
								</Button>
								<Button
									variant="ghost"
									size="icon-xs"
									onClick={() => model.actions.delete(entry.path)}
									title={model.labels.deleteProject}
									className="text-muted-foreground hover:text-destructive"
								>
									<span className="icon-[mdi--delete-outline] h-3.5 w-3.5" />
								</Button>
							</div>
						</div>
					))}
				</SettingSection>
			)}
		</div>
	);
}
