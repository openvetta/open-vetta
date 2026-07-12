import { ActivityPanel } from "@domains/activity-panel/components/ActivityPanel";
import { FlowingWorkflow } from "@domains/flowing/components/FlowingWorkflow";
import { WorkflowBindDialog } from "@domains/flowing/components/WorkflowBindDialog";
import { WorkflowProgress } from "@domains/flowing/components/WorkflowProgress";
import { ProjectDetailPageView } from "@vetta/theme-ui/project";
import { motion } from "motion/react";
import { BatchQueueStatus } from "./BatchQueueStatus";
import { useProjectDetailPageModel } from "../hooks/useProjectDetailPageModel";

const easeOut = [0.22, 1, 0.36, 1] as const;

export function ProjectDetailPage(): JSX.Element {
	const model = useProjectDetailPageModel();

	const batchSection =
		model.isBatch && model.batchProject ? (
			<motion.div
				className="px-10 py-6"
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.5, delay: 0.35, ease: easeOut }}
			>
				<BatchQueueStatus project={model.batchProject} />
			</motion.div>
		) : null;

	const flowingSection =
		model.projectType === "flowing" && model.flowingId ? (
			<motion.div
				className="px-10 py-6"
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.5, delay: 0.35, ease: easeOut }}
			>
				<FlowingWorkflow flowingId={model.flowingId} />
			</motion.div>
		) : null;

	const workflowProgressSection =
		!model.isPersonal && model.workflowInstance ? (
			<motion.div
				className="px-10 py-6"
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.5, delay: 0.4, ease: easeOut }}
			>
				<WorkflowProgress instance={model.workflowInstance} />
			</motion.div>
		) : null;

	return (
		<ProjectDetailPageView
			activityOpen={model.activityOpen}
			activityPanel={<ActivityPanel cwd={model.decodedCwd} />}
			batchSection={batchSection}
			bindDialog={
				!model.isPersonal ? (
					<WorkflowBindDialog
						open={model.bindDialogOpen}
						onOpenChange={model.setBindDialogOpen}
						projectDir={model.decodedCwd}
						projectName={model.displayName}
						flowingId={model.flowingId ?? undefined}
					/>
				) : null
			}
			content={model.content}
			createdAtLabel={model.createdAtLabel}
			cwd={model.cwd}
			displayName={model.displayName}
			editorFocused={model.editorFocused}
			exportable={model.exportable}
			flowingSection={flowingSection}
			isDirty={model.isDirty}
			labels={model.labels}
			loading={model.loading}
			onBindWorkflow={model.onBindWorkflow}
			onContentChange={model.onContentChange}
			onEditorBlur={model.onEditorBlur}
			onEditorFocus={model.onEditorFocus}
			onExport={model.onExport}
			onNewSession={model.onNewSession}
			onSave={model.onSave}
			onShowInFolder={model.onShowInFolder}
			onToggleActivity={model.onToggleActivity}
			projectTypeLabel={model.projectTypeLabel}
			saveStatus={model.saveStatus}
			sessionCountLabel={model.sessionCountLabel}
			showBindWorkflow={model.showBindWorkflow}
			taskCountLabel={model.taskCountLabel}
			textareaRef={model.textareaRef}
			workflowProgressSection={workflowProgressSection}
		/>
	);
}
