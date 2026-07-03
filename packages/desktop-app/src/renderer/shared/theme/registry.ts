import type { LoginDialogView } from "@domains/auth/components/LoginDialogView";
import type { AtPanelView } from "@domains/chat/components/at-panel/AtPanelView";
import type { InputBarView } from "@domains/chat/components/input-bar/InputBarView";
import type { QuestionPanelView } from "@domains/chat/components/question-panel/QuestionPanelView";
import type { SlashPanelView } from "@domains/chat/components/slash-panel/SlashPanelView";
import type { FilePreviewDialogView } from "@domains/file-preview/components/FilePreviewDialogView";
import type { FlowingSendDialogView } from "@domains/flowing/components/FlowingSendDialogView";
import type { WorkflowCompleteDialogView } from "@domains/flowing/components/WorkflowCompleteDialogView";
import type { KnowledgeDropOverlayView } from "@domains/knowledge-base/components/KnowledgeDropOverlayView";
import type { SidebarNavItemButton } from "@domains/project/components/sidebar/SidebarNavItemButton";
import type { SettingsMenuTrigger } from "@domains/project/components/sidebar/settings-menu/SettingsMenuTrigger";
import type { SidebarRegionProps } from "@domains/project/components/sidebar/types";
import type { AppearanceApprovalDrawerView } from "@shared/action-approval/appearance/AppearanceApprovalDrawerView";
import type { BatchTasksApprovalFrameView } from "@shared/action-approval/batch-tasks/BatchTasksApprovalFrameView";
import type { GenericActionApprovalView } from "@shared/action-approval/GenericActionApprovalView";
import type { NavigationOpenApprovalView } from "@shared/action-approval/navigation/NavigationOpenApprovalView";
import type { SchedulerActionApprovalDialogView } from "@shared/action-approval/scheduler/SchedulerActionApprovalDialogView";
import type { SchedulerEditApprovalDrawerView } from "@shared/action-approval/scheduler/SchedulerEditApprovalDrawerView";
import type {
	PageHeaderRegionProps,
	PageHeaderSidebarTrigger,
	PageHeaderTitle,
	PageHeaderWindowActions,
} from "@shared/app-shell/page-header";
import type { WindowControlButton, WindowControlsComponentProps } from "@shared/app-shell/window-controls";
import type { DrawerCard } from "@shared/components/DrawerCard";
import type { UpdateRestartDialogView } from "@shared/components/UpdateRestartDialogView";
import type { ConfirmDialogView } from "@shared/components/ui/ConfirmDialogView";
import type { ThemeSurfaceConfig } from "@vetta/theme-sdk";
import type { ComponentType } from "react";

declare module "@vetta/theme-sdk" {
	interface ThemeRegionRegistry {
		readonly "app.pageHeader"?: ComponentType<PageHeaderRegionProps>;
		readonly sidebar?: ComponentType<SidebarRegionProps>;
	}

	interface ThemeComponentRegistry {
		readonly "app.pageHeaderSidebarTrigger"?: typeof PageHeaderSidebarTrigger;
		readonly "app.pageHeaderTitle"?: typeof PageHeaderTitle;
		readonly "app.pageHeaderWindowActions"?: typeof PageHeaderWindowActions;
		readonly "app.windowControls"?: ComponentType<WindowControlsComponentProps>;
		readonly "app.windowControlButton"?: typeof WindowControlButton;
		readonly "chat.atPanelView"?: typeof AtPanelView;
		readonly "chat.inputDrawer"?: typeof DrawerCard;
		readonly "chat.inputBarView"?: typeof InputBarView;
		readonly "chat.questionPanelView"?: typeof QuestionPanelView;
		readonly "chat.slashPanelView"?: typeof SlashPanelView;
		readonly "root.approval.appearancePicker"?: ComponentType;
		readonly "root.approval.appearanceDrawerView"?: typeof AppearanceApprovalDrawerView;
		readonly "root.approval.batchTasksExecution"?: ComponentType;
		readonly "root.approval.batchTasksFrameView"?: typeof BatchTasksApprovalFrameView;
		readonly "root.approval.batchTasksProject"?: ComponentType;
		readonly "root.approval.batchTasksTask"?: ComponentType;
		readonly "root.approval.navigationOpen"?: ComponentType;
		readonly "root.approval.navigationOpenView"?: typeof NavigationOpenApprovalView;
		readonly "root.approval.schedulerCreate"?: ComponentType;
		readonly "root.approval.schedulerActionView"?: typeof SchedulerActionApprovalDialogView;
		readonly "root.approval.schedulerDelete"?: ComponentType;
		readonly "root.approval.schedulerEditView"?: typeof SchedulerEditApprovalDrawerView;
		readonly "root.approval.schedulerExecution"?: ComponentType;
		readonly "root.approval.schedulerToggle"?: ComponentType;
		readonly "root.approval.schedulerUpdate"?: ComponentType;
		readonly "root.approval.themeChange"?: ComponentType;
		readonly "root.confirmDialog"?: ComponentType;
		readonly "root.confirmDialogView"?: typeof ConfirmDialogView;
		readonly "root.filePreviewDialog"?: ComponentType;
		readonly "root.filePreviewDialogView"?: typeof FilePreviewDialogView;
		readonly "root.flowingSendDialog"?: ComponentType;
		readonly "root.flowingSendDialogView"?: typeof FlowingSendDialogView;
		readonly "root.genericActionApproval"?: ComponentType;
		readonly "root.genericActionApprovalView"?: typeof GenericActionApprovalView;
		readonly "root.knowledgeDropOverlay"?: ComponentType;
		readonly "root.knowledgeDropOverlayView"?: typeof KnowledgeDropOverlayView;
		readonly "root.loginDialog"?: ComponentType;
		readonly "root.loginDialogView"?: typeof LoginDialogView;
		readonly "root.toaster"?: ComponentType;
		readonly "root.updateRestartDialog"?: ComponentType;
		readonly "root.updateRestartDialogView"?: typeof UpdateRestartDialogView;
		readonly "root.workflowCompleteDialog"?: ComponentType;
		readonly "root.workflowCompleteDialogView"?: typeof WorkflowCompleteDialogView;
		readonly "sidebar.navItem"?: typeof SidebarNavItemButton;
		readonly "sidebar.settingsTrigger"?: typeof SettingsMenuTrigger;
	}

	interface ThemeSurfaceRegistry {
		readonly "app.pageHeader"?: ThemeSurfaceConfig;
		readonly "app.windowControls"?: ThemeSurfaceConfig;
		readonly "chat.atPanel"?: ThemeSurfaceConfig;
		readonly "chat.inputDrawer"?: ThemeSurfaceConfig;
		readonly "chat.inputBar"?: ThemeSurfaceConfig;
		readonly "chat.questionPanel"?: ThemeSurfaceConfig;
		readonly "chat.slashPanel"?: ThemeSurfaceConfig;
		readonly "root.confirmDialog.panel"?: ThemeSurfaceConfig;
		readonly "root.filePreviewDialog"?: ThemeSurfaceConfig;
		readonly "root.filePreviewDialog.panel"?: ThemeSurfaceConfig;
		readonly "root.flowingSendDialog.panel"?: ThemeSurfaceConfig;
		readonly "root.genericActionApproval.panel"?: ThemeSurfaceConfig;
		readonly "root.knowledgeDropOverlay"?: ThemeSurfaceConfig;
		readonly "root.loginDialog.panel"?: ThemeSurfaceConfig;
		readonly "root.approval.appearance.panel"?: ThemeSurfaceConfig;
		readonly "root.approval.batchTasks.panel"?: ThemeSurfaceConfig;
		readonly "root.approval.navigationOpen.panel"?: ThemeSurfaceConfig;
		readonly "root.approval.schedulerAction.panel"?: ThemeSurfaceConfig;
		readonly "root.approval.schedulerEdit.panel"?: ThemeSurfaceConfig;
		readonly "root.updateRestartDialog.panel"?: ThemeSurfaceConfig;
		readonly "root.workflowCompleteDialog.panel"?: ThemeSurfaceConfig;
		readonly "sidebar.panel"?: ThemeSurfaceConfig;
		readonly "sidebar.topBar"?: ThemeSurfaceConfig;
		readonly "sidebar.navigation"?: ThemeSurfaceConfig;
		readonly "sidebar.projects"?: ThemeSurfaceConfig;
		readonly "sidebar.bottomBar"?: ThemeSurfaceConfig;
		readonly "sidebar.settingsMenu"?: ThemeSurfaceConfig;
		readonly "sidebar.messageCenter"?: ThemeSurfaceConfig;
	}
}
