import { Outlet } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { LoginDialog } from "../domains/auth/components/LoginDialog";
import { FilePreviewDialog } from "../domains/file-preview/components/FilePreviewDialog";
import { FlowingSendDialog } from "../domains/flowing/components/FlowingSendDialog";
import { WorkflowCompleteDialog } from "../domains/flowing/components/WorkflowCompleteDialog";
import { KnowledgeDropOverlay } from "../domains/knowledge-base/components/KnowledgeDropOverlay";
import { PluginGlobalSlotHost } from "../domains/plugins/components/PluginGlobalSlotHost";
import { Sidebar } from "../domains/project/components/sidebar/Sidebar";
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
import { PageHeader } from "../shared/app-shell/page-header";
import { UpdateRestartDialog } from "../shared/components/UpdateRestartDialog";
import { Toaster } from "../shared/components/ui/Toaster";
import { ConfirmDialog } from "../shared/components/ui/confirm-dialog";
import { TooltipProvider } from "../shared/components/ui/tooltip";
import type { RootLayoutModel } from "./types";

interface RootLayoutViewProps {
	model: RootLayoutModel;
}

export function RootLayoutView({ model }: RootLayoutViewProps): JSX.Element {
	const {
		actions,
		narrow,
		onOpenSession,
		overlayOpen,
		sidebarCollapsed,
	} = model;

	return (
		<TooltipProvider>
			<div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
				<div className="relative flex flex-1 gap-2 overflow-hidden p-2">
					<AnimatePresence initial={false}>
						{!narrow && !sidebarCollapsed && (
							<motion.div
								key="sidebar"
								initial={{ width: 0, opacity: 0, marginRight: -8 }}
								animate={{ width: "auto", opacity: 1, marginRight: 0 }}
								exit={{ width: 0, opacity: 0, marginRight: -8 }}
								transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
								className="overflow-visible"
							>
								<Sidebar onOpenSession={onOpenSession} onCollapse={actions.toggleSidebar} />
							</motion.div>
						)}
					</AnimatePresence>
					{/* 窄屏悬浮侧边栏：绝对定位覆盖在内容之上，不挤压布局；移出即隐藏 */}
					<AnimatePresence>
						{narrow && overlayOpen && (
							<motion.div
								key="sidebar-overlay"
								initial={{ opacity: 0, x: -12 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: -12 }}
								transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
								onMouseEnter={actions.openOverlay}
								// 缓冲关闭：浮层四周留有 8px 缝，且关闭时会露出 PageHeader 触发按钮。
								// 指针在顶部边缘微动会反复穿越「浮层↔缝/触发按钮」，若立即关闭便与触发
								// 按钮的重新打开形成 open/close 抖动。改用 120ms 宽限，re-enter 即取消。
								onMouseLeave={actions.scheduleOverlayClose}
								// no-drag：挖掉浮层脚下 PageHeader 的 -webkit-app-region: drag，
								// 否则与其重叠的区域鼠标事件被 OS 拖拽区吞掉，触发 mouseleave 误隐藏。
								className="no-drag absolute inset-y-2 left-2 z-50 overflow-visible rounded-[10px] shadow-2xl shadow-black/30"
							>
								<Sidebar onOpenSession={onOpenSession} onCollapse={actions.closeOverlay} floating />
							</motion.div>
						)}
					</AnimatePresence>
					<main className="relative flex min-w-[320px] flex-1 flex-col overflow-hidden bg-transparent">
						<PageHeader
							sidebarCollapsed={sidebarCollapsed}
							narrow={narrow}
							onExpandSidebar={actions.toggleSidebar}
							onOverlayOpen={actions.openOverlay}
							onOverlayClose={actions.scheduleOverlayClose}
						/>
						<div className="flex flex-1 overflow-hidden">
							<Outlet />
						</div>
					</main>
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
				</div>
			</div>
		</TooltipProvider>
	);
}
