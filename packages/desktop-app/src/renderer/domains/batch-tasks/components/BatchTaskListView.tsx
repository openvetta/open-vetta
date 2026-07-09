import type { BatchProject } from "@shared/store/atoms";
import type { BatchTaskListActions } from "../hooks/useBatchTaskListModel";
import { BatchTaskProjectBlock } from "./batch-task-list/BatchTaskProjectBlock";

interface BatchTaskListViewProps {
	actions: BatchTaskListActions;
	projects: BatchProject[];
	queuedTaskIds: Set<string>;
	onEditProject: (project: BatchProject) => void;
}

export function BatchTaskListView({
	actions,
	projects,
	queuedTaskIds,
	onEditProject,
}: BatchTaskListViewProps): JSX.Element {
	return (
		<div className="flex flex-col gap-6">
			{projects.map((project) => (
				<BatchTaskProjectBlock
					key={project.id}
					actions={actions}
					project={project}
					queuedTaskIds={queuedTaskIds}
					onEditProject={onEditProject}
				/>
			))}
		</div>
	);
}
