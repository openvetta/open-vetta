import type { JSX, ReactNode } from "react";
import { ProjectRowView, type ProjectRowViewProps } from "./ProjectRowView";
import { ProjectSessionsView, type ProjectSessionsViewProps } from "./ProjectSessionsView";

export interface ProjectGroupViewProps<T extends { key: string }> {
	projectRow: ProjectRowViewProps;
	sessions: Omit<ProjectSessionsViewProps<T>, "empty">;
	/** Empty sessions label node. */
	emptySessions: ReactNode;
}

export function ProjectGroupView<T extends { key: string }>({
	projectRow,
	sessions,
	emptySessions,
}: ProjectGroupViewProps<T>): JSX.Element {
	return (
		<div className="project-group-contain mb-1">
			<ProjectRowView {...projectRow} />
			<ProjectSessionsView {...sessions} empty={emptySessions} />
		</div>
	);
}
