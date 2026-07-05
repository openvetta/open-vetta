import type { ComponentType } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PluginActivityTabPanel } from "@domains/plugins/components/PluginActivityTabPanel";
import { ResizeHandle } from "@shared/components/ResizeHandle";
import { TabBar } from "@shared/components/ui/tab-bar";
import type { ActivityTabKey } from "@shared/lib/project-profile";
import { BackgroundTasksTabPanel } from "../BackgroundTasksTabPanel";
import { BatchProgressTabPanel } from "../BatchProgressTabPanel";
import { BrowserPanel } from "../BrowserPanel";
import { ChatTabPanel } from "../ChatTabPanel";
import { DebugTabPanel } from "../DebugTabPanel";
import { FileTabContent } from "../file-tab/FileTabContent";
import { JourneyPanel } from "../JourneyPanel";
import { KnowledgeHistoryPanel } from "../KnowledgeHistoryPanel";
import { PluginTabPicker } from "../PluginTabPicker";
import { ScheduleExecutionTabPanel } from "../ScheduleExecutionTabPanel";
import { TodoTabPanel } from "../TodoTabPanel";
import type { ActivityPanelFrameProps } from "./ActivityPanelFrame";
import type { ActivityPanelActions, ActivityPanelModel } from "./types";

interface ActivityPanelViewProps {
	actions: ActivityPanelActions;
	Frame: ComponentType<ActivityPanelFrameProps>;
	model: ActivityPanelModel;
}

export function ActivityPanelView({
	actions,
	Frame,
	model,
}: ActivityPanelViewProps): JSX.Element {
	const panelBody = (
		<>
			{(model.tabItems.length > 0 || model.showTabPicker) && (
				<div className="group/activity-tabs relative z-0 flex shrink-0 items-end pt-1">
					<TabBar
						className="min-w-0 flex-1"
						items={model.tabItems}
						value={model.activeTab}
						onChange={actions.onTabChange}
						suppressLayoutAnimation={model.isResizing}
						onRemove={model.knowledgeHistory ? undefined : actions.onRemoveTab}
						onReorder={model.knowledgeHistory ? undefined : actions.onReorderTabs}
						onOverflowChange={
							model.knowledgeHistory ? undefined : actions.onOverflowChange
						}
					/>
					{model.showTabPicker && (
						<PluginTabPicker
							hiddenTabs={model.restorableTabs}
							onRestore={actions.onRestoreTab}
							overflowTabs={model.overflowTabs}
							onSelectOverflow={(key) => actions.onTabChange(key as ActivityTabKey)}
						/>
					)}
				</div>
			)}
			<Frame>
				<div key={model.cwd ?? "__none__"} className="flex min-h-0 flex-1 flex-col">
					{model.activeTab === "file" && <FileTabContent cwd={model.cwd} />}
					{model.activeTab === "journey" && model.cwd && <JourneyPanel cwd={model.cwd} />}
					{model.activeTab === "chat" && model.cwd && <ChatTabPanel cwd={model.cwd} />}
					{model.activeTab === "batch-progress" && model.cwd && (
						<BatchProgressTabPanel cwd={model.cwd} />
					)}
					{model.activeTab === "schedule-records" && model.cwd && (
						<ScheduleExecutionTabPanel cwd={model.cwd} />
					)}
					{model.activeTab === "todo" && model.cwd && <TodoTabPanel />}
					{model.activeTab === "background-tasks" && model.cwd && (
						<BackgroundTasksTabPanel />
					)}
					{model.activeTab === "debug" && model.cwd && <DebugTabPanel cwd={model.cwd} />}
					{model.activeTab === "knowledge-history" && (
						<KnowledgeHistoryPanel cwd={model.cwd} />
					)}
					{model.activePluginTab && model.cwd && (
						<PluginActivityTabPanel tab={model.activePluginTab} cwd={model.cwd} />
					)}
					{model.cwd &&
						(model.activeTab === "browser" || model.browserUrl !== null) && (
							<div
								className={
									model.activeTab === "browser"
										? "flex min-h-0 flex-1 flex-col"
										: "hidden"
								}
							>
								<BrowserPanel />
							</div>
						)}
				</div>
			</Frame>
		</>
	);

	return (
		<>
			{!model.narrowSheet && (
				<aside
					style={{
						width: model.isOpen ? model.width : 0,
						transition: model.isResizing ? "none" : "width 0.2s ease-in-out",
					}}
					className="relative shrink-0 overflow-visible"
				>
					<div
						aria-hidden={!model.isOpen}
						className={
							model.isOpen
								? "flex h-full flex-col opacity-100 transition-opacity duration-150"
								: "pointer-events-none flex h-full flex-col opacity-0 transition-opacity duration-150"
						}
						style={{ width: model.width }}
					>
						{panelBody}
					</div>
					{model.isOpen && (
						<ResizeHandle
							side="left"
							onResize={actions.onResize}
							onResizeEnd={actions.onResizeEnd}
						/>
					)}
				</aside>
			)}
			<AnimatePresence>
				{model.bottomSheet && (
					<>
						<motion.div
							key="activity-sheet-backdrop"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.2 }}
							onClick={actions.onClose}
							className="fixed inset-0 z-40 bg-black/25"
						/>
						<motion.div
							key="activity-sheet"
							initial={{ y: "100%" }}
							animate={{ y: 0 }}
							exit={{ y: "100%" }}
							transition={{ duration: 0.26, ease: [0.22, 0.61, 0.36, 1] }}
							className="fixed inset-x-0 bottom-0 top-16 z-50 flex flex-col rounded-t-2xl border-t border-border bg-background p-2 shadow-2xl shadow-black/40"
						>
							{panelBody}
						</motion.div>
					</>
				)}
			</AnimatePresence>
		</>
	);
}
