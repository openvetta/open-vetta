import type { JSX, ReactNode } from "react";

export interface ProjectsPanelEmptyStateLabels {
	title: string;
}

export interface ProjectsPanelEmptyStateProps {
	/** Full-width primary action, e.g. the add-project menu. */
	action?: ReactNode;
	labels: ProjectsPanelEmptyStateLabels;
}

export function ProjectsPanelEmptyState({ action, labels }: ProjectsPanelEmptyStateProps): JSX.Element {
	return (
		<div className="flex flex-col gap-2 px-1 py-2">
			<p className="px-1 text-[12px] text-muted-foreground">{labels.title}</p>
			{action}
		</div>
	);
}
