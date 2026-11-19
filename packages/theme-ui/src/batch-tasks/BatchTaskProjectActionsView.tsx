import { ButtonGroup, ButtonGroupItem } from "@vetta-org/ui";
import type { JSX } from "react";
import type { BatchProjectCountsView, BatchTaskProjectActionsLabels } from "./types";

export interface BatchTaskProjectActionsViewProps {
	counts: BatchProjectCountsView;
	hasQueued: boolean;
	labels: BatchTaskProjectActionsLabels;
	onBatchReset: () => void;
	onBatchStart: () => void;
	onBatchStop: () => void;
	onDeleteProject: () => void;
	onEditProject: () => void;
}

function actionIcon(name: string): JSX.Element {
	return <span className={`${name} size-4`} />;
}

export function BatchTaskProjectActionsView({
	counts,
	hasQueued,
	labels,
	onBatchReset,
	onBatchStart,
	onBatchStop,
	onDeleteProject,
	onEditProject,
}: BatchTaskProjectActionsViewProps): JSX.Element {
	const isActive = counts.running > 0 || hasQueued;
	const startDisabled = counts.neverExecuted === 0 && counts.paused === 0;
	const startTitle = startDisabled
		? counts.failed > 0
			? labels.allDoneOrFailed(counts.failed)
			: labels.allDone
		: labels.start;

	return (
		<div className="flex items-center gap-1.5">
			<ButtonGroup>
				{isActive ? (
					<ButtonGroupItem
						icon={actionIcon("icon-[solar--stop-linear]")}
						title={labels.stop}
						aria-label={labels.stop}
						onClick={onBatchStop}
					/>
				) : (
					<ButtonGroupItem
						icon={actionIcon("icon-[solar--play-linear]")}
						title={startTitle}
						aria-label={labels.start}
						onClick={onBatchStart}
						disabled={startDisabled}
					/>
				)}
				<ButtonGroupItem
					icon={actionIcon("icon-[solar--refresh-linear]")}
					title={labels.reset}
					aria-label={labels.reset}
					onClick={onBatchReset}
					disabled={counts.total === 0}
				/>
			</ButtonGroup>
			<ButtonGroup>
				<ButtonGroupItem
					icon={actionIcon("icon-[solar--pen-2-linear]")}
					title={labels.editProject}
					aria-label={labels.editProject}
					onClick={onEditProject}
				/>
				<ButtonGroupItem
					icon={actionIcon("icon-[solar--trash-bin-trash-linear]")}
					title={labels.deleteProject}
					aria-label={labels.deleteProject}
					onClick={onDeleteProject}
					disabled={counts.running > 0}
				/>
			</ButtonGroup>
		</div>
	);
}

