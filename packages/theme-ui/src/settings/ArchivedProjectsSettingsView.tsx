import type { JSX, ReactNode } from "react";
import { SettingSection, type SettingSectionMeta } from "./SettingChrome";

export interface ArchivedProjectRowView {
	readonly path: string;
	readonly name: string;
}

export interface ArchivedProjectsSettingsViewLabels {
	readonly title: string;
	readonly empty: string;
	readonly sectionTitle: string;
}

export interface ArchivedProjectsSettingsViewProps {
	readonly labels: ArchivedProjectsSettingsViewLabels;
	readonly projects: readonly ArchivedProjectRowView[];
	readonly section: SettingSectionMeta;
	/** Host injects action buttons (e.g. unarchive / delete) per row. */
	readonly renderProjectActions: (project: ArchivedProjectRowView) => ReactNode;
}

/**
 * Props-only archived projects list. Host Button chrome stays in desktop via slots.
 */
export function ArchivedProjectsSettingsView({
	labels,
	projects,
	section,
	renderProjectActions,
}: ArchivedProjectsSettingsViewProps): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-foreground">{labels.title}</h1>

			{projects.length === 0 ? (
				<div className="flex flex-col items-center gap-2.5 py-16 text-center">
					<span className="icon-[mdi--archive-off-outline] h-8 w-8 text-muted-foreground" />
					<p className="text-[13px] text-muted-foreground">{labels.empty}</p>
				</div>
			) : (
				<SettingSection title={labels.sectionTitle} section={section}>
					{projects.map((entry) => (
						<div
							key={entry.path}
							className="flex items-center gap-3 border-b border-border px-5 py-3.5 last:border-b-0"
						>
							<span className="icon-[mdi--folder-outline] h-4 w-4 shrink-0 text-muted-foreground" />
							<div className="min-w-0 flex-1">
								<div className="text-[13px] font-medium text-foreground">{entry.name}</div>
								<div className="mt-0.5 truncate text-[11px] text-muted-foreground">{entry.path}</div>
							</div>
							<div className="flex items-center gap-1">{renderProjectActions(entry)}</div>
						</div>
					))}
				</SettingSection>
			)}
		</div>
	);
}
