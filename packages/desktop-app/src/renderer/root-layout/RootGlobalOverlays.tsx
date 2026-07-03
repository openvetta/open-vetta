import { LoginDialog } from "../domains/auth/components/LoginDialog";
import { FilePreviewDialog } from "../domains/file-preview/components/FilePreviewDialog";
import { FlowingSendDialog } from "../domains/flowing/components/FlowingSendDialog";
import { WorkflowCompleteDialog } from "../domains/flowing/components/WorkflowCompleteDialog";
import { KnowledgeDropOverlay } from "../domains/knowledge-base/components/KnowledgeDropOverlay";
import { PluginGlobalSlotHost } from "../domains/plugins/components/PluginGlobalSlotHost";
import { ActionApprovalCenter } from "../shared/action-approval/ActionApprovalCenter";
import { AppearancePickerApproval } from "../shared/action-approval/appearance/AppearancePickerApproval";
import { ThemeChangeApproval } from "../shared/action-approval/appearance/ThemeChangeApproval";
import { BatchTasksExecutionApproval } from "../shared/action-approval/batch-tasks/BatchTasksExecutionApproval";
import { BatchTasksProjectApproval } from "../shared/action-approval/batch-tasks/BatchTasksProjectApproval";
import { BatchTasksTaskApproval } from "../shared/action-approval/batch-tasks/BatchTasksTaskApproval";
import { GenericActionApproval } from "../shared/action-approval/GenericActionApproval";
import { NavigationOpenApproval } from "../shared/action-approval/navigation/NavigationOpenApproval";
import { SchedulerCreateApproval } from "../shared/action-approval/scheduler/SchedulerCreateApproval";
import { SchedulerDeleteApproval } from "../shared/action-approval/scheduler/SchedulerDeleteApproval";
import { SchedulerExecutionApproval } from "../shared/action-approval/scheduler/SchedulerExecutionApproval";
import { SchedulerToggleApproval } from "../shared/action-approval/scheduler/SchedulerToggleApproval";
import { SchedulerUpdateApproval } from "../shared/action-approval/scheduler/SchedulerUpdateApproval";
import { UpdateRestartDialog } from "../shared/components/UpdateRestartDialog";
import { Toaster } from "../shared/components/ui/Toaster";
import { ConfirmDialog } from "../shared/components/ui/confirm-dialog";

export function RootGlobalOverlays(): JSX.Element {
	return (
		<>
			<ConfirmDialog />
			<LoginDialog />
			<FlowingSendDialog />
			<WorkflowCompleteDialog />
			<FilePreviewDialog />
			<UpdateRestartDialog />
			<ActionApprovalCenter />
			<GenericActionApproval />
			<AppearancePickerApproval />
			<ThemeChangeApproval />
			<NavigationOpenApproval />
			<BatchTasksProjectApproval />
			<BatchTasksTaskApproval />
			<BatchTasksExecutionApproval />
			<SchedulerCreateApproval />
			<SchedulerUpdateApproval />
			<SchedulerDeleteApproval />
			<SchedulerToggleApproval />
			<SchedulerExecutionApproval />
			<PluginGlobalSlotHost />
			<KnowledgeDropOverlay />
			<Toaster />
		</>
	);
}
