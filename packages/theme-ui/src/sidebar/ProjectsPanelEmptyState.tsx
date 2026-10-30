import type { JSX } from "react";

export interface ProjectsPanelEmptyStateLabels {
	title: string;
	description: string;
}

export interface ProjectsPanelEmptyStateProps {
	labels: ProjectsPanelEmptyStateLabels;
}

export function ProjectsPanelEmptyState({ labels }: ProjectsPanelEmptyStateProps): JSX.Element {
	return (
		<p className="px-2.5 py-2 text-[12px] text-muted-foreground">{labels.description}</p>
	);
}
