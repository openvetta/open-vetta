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
		<div className="px-1 py-1.5">
			<p className="rounded-lg border border-dashed border-border/60 px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground/80">{labels.description}</p>
		</div>
	);
}
