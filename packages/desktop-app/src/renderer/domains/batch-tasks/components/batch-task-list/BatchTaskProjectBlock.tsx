import type { BatchProject } from "@shared/store/atoms";
import { useMemo, useState } from "react";
import type { BatchTaskListActions } from "../../hooks/useBatchTaskListModel";
import { computeCounts, sortTasks, TASK_COLLAPSE_THRESHOLD } from "../../utils/batchTaskListData";
import { BatchTaskGrid } from "./BatchTaskGrid";
import { BatchTaskProjectActions } from "./BatchTaskProjectActions";
import { BatchTaskProjectHeader } from "./BatchTaskProjectHeader";
import type { TaskCallbacks } from "./types";

export function BatchTaskProjectBlock({
	actions,
	project,
	queuedTaskIds,
	onEditProject,
}: {
	actions: BatchTaskListActions;
	project: BatchProject;
	queuedTaskIds: Set<string>;
	onEditProject: (project: BatchProject) => void;
}): JSX.Element {
	const counts = useMemo(() => computeCounts(project.tasks), [project.tasks]);
	const progress = counts.total > 0 ? (counts.completed / counts.total) * 100 : 0;
	const [expanded, setExpanded] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const normalizedQuery = searchQuery.trim().toLowerCase();
	const sortedTasks = useMemo(() => sortTasks(project.tasks), [project.tasks]);
	const filteredTasks = useMemo(
		() => (normalizedQuery ? sortedTasks.filter((task) => task.name.toLowerCase().includes(normalizedQuery)) : sortedTasks),
		[sortedTasks, normalizedQuery],
	);
	const filteredTotal = filteredTasks.length;
	const collapsed = !normalizedQuery && !expanded && filteredTotal > TASK_COLLAPSE_THRESHOLD;
	const visibleTasks = collapsed ? filteredTasks.slice(0, TASK_COLLAPSE_THRESHOLD) : filteredTasks;
	const hiddenCount = filteredTotal - visibleTasks.length;

	const callbacks = useMemo<TaskCallbacks>(
		() => ({
			delete: (task) => actions.deleteTask(project, task),
			goToSession: (task) => actions.goToSession(task),
			resume: (taskId) => actions.resumeTask(project.id, taskId),
			retry: (task) => actions.retryTask(project, task),
			run: (taskId) => actions.runTask(project.id, taskId),
			stop: (taskId) => actions.stopTask(project.id, taskId),
		}),
		[actions, project],
	);

	return (
		<div className="relative">
			<div className="flex items-center gap-3 pb-3">
				<BatchTaskProjectHeader
					counts={counts}
					filteredTotal={filteredTotal}
					normalizedQuery={normalizedQuery}
					onResetFailed={() => actions.resetFailed(project, counts)}
					project={project}
				/>
				<BatchTaskProjectActions
					actions={actions}
					counts={counts}
					project={project}
					queuedTaskIds={queuedTaskIds}
					onEditProject={onEditProject}
				/>
			</div>

			<div className="pb-3">
				<div className="relative h-1 overflow-hidden rounded-full bg-accent/30">
					<div
						className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-700 ease-out"
						style={{ width: `${progress}%` }}
					/>
				</div>
			</div>

			<BatchTaskGrid
				callbacks={callbacks}
				collapsed={collapsed}
				countsTotal={counts.total}
				filteredTotal={filteredTotal}
				hiddenCount={hiddenCount}
				normalizedQuery={normalizedQuery}
				onClearSearch={() => setSearchQuery("")}
				onSearchChange={setSearchQuery}
				onToggleExpanded={() => setExpanded((value) => !value)}
				queuedTaskIds={queuedTaskIds}
				searchQuery={searchQuery}
				visibleTasks={visibleTasks}
			/>
		</div>
	);
}
