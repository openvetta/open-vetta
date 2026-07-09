import type { BatchProject } from "@shared/store/atoms";
import { useTranslation } from "react-i18next";
import type { BatchTaskListActions, ProjectCounts } from "../../hooks/useBatchTaskListModel";
import { ActionButton } from "./BatchTaskActionButtons";

export function BatchTaskProjectActions({
	actions,
	counts,
	project,
	queuedTaskIds,
	onEditProject,
}: {
	actions: BatchTaskListActions;
	counts: ProjectCounts;
	project: BatchProject;
	queuedTaskIds: Set<string>;
	onEditProject: (project: BatchProject) => void;
}): JSX.Element {
	const { t } = useTranslation("batch-tasks");
	const hasQueued = project.tasks.some((task) => queuedTaskIds.has(task.id));
	const isActive = counts.running > 0 || hasQueued;

	return (
		<div className="flex items-center gap-0.5">
			{isActive ? (
				<ActionButton
					icon="icon-[solar--stop-linear]"
					title={t("actions.stop")}
					variant="danger"
					onClick={() => actions.batchStop(project, counts)}
				/>
			) : (
				<ActionButton
					icon="icon-[solar--play-linear]"
					title={
						counts.neverExecuted === 0 && counts.paused === 0
							? counts.failed > 0
								? t("actions.allDoneOrFailed", { n: counts.failed })
								: t("actions.allDone")
							: t("actions.start")
					}
					onClick={() => actions.batchStart(project, counts)}
					disabled={counts.neverExecuted === 0 && counts.paused === 0}
				/>
			)}
			<ActionButton
				icon="icon-[solar--refresh-linear]"
				title={t("actions.reset")}
				variant="danger"
				onClick={() => actions.batchReset(project)}
				disabled={counts.total === 0}
			/>
			<div className="mx-1 h-4 w-px bg-border/60" />
			<ActionButton
				icon="icon-[solar--pen-2-linear]"
				title={t("actions.editProject")}
				onClick={() => onEditProject(project)}
			/>
			<ActionButton
				icon="icon-[solar--trash-bin-trash-linear]"
				title={t("actions.deleteProject")}
				variant="danger"
				onClick={() => actions.deleteProject(project)}
				disabled={counts.running > 0}
			/>
		</div>
	);
}
