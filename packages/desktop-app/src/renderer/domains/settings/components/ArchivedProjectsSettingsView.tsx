import { Button } from "@shared/components/ui/button";
import {
	ArchivedProjectsSettingsView as ThemeArchivedProjectsSettingsView,
	type ArchivedProjectRowView,
} from "@vetta/theme-ui/settings";
import { SETTINGS_SECTION } from "../registry";
import type { ArchivedProjectsSettingsModel } from "./useArchivedProjectsSettingsModel";

export interface ArchivedProjectsSettingsViewProps {
	model: ArchivedProjectsSettingsModel;
}

export function ArchivedProjectsSettingsView({ model }: ArchivedProjectsSettingsViewProps): JSX.Element {
	return (
		<ThemeArchivedProjectsSettingsView
			labels={model.labels}
			projects={model.projects}
			section={SETTINGS_SECTION["archived-list"]}
			renderProjectActions={(entry: ArchivedProjectRowView) => (
				<>
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
				</>
			)}
		/>
	);
}
