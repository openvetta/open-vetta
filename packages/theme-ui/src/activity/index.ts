import type { ActivityPanelFrame } from "./ActivityPanelFrame";

declare module "@vetta/theme-sdk" {
	interface ThemeComponentRegistry {
		readonly "activity.panelFrame"?: typeof ActivityPanelFrame;
	}
}

export type { ActivityPanelFrameProps } from "./ActivityPanelFrame";
export { ActivityPanelFrame } from "./ActivityPanelFrame";
export type {
	BackgroundTaskStatus,
	BackgroundTasksTabPanelViewProps,
	BackgroundTaskViewItem,
} from "./BackgroundTasksTabPanelView";
export { BackgroundTasksTabPanelView } from "./BackgroundTasksTabPanelView";
export type { BatchProgressTabPanelViewProps } from "./BatchProgressTabPanelView";
export { BatchProgressTabPanelView } from "./BatchProgressTabPanelView";
export type { BrowserPanelLabels, BrowserPanelViewProps } from "./BrowserPanelView";
export { BrowserPanelView } from "./BrowserPanelView";
export type { CodePreviewProps } from "./CodePreview";
export { CodePreview } from "./CodePreview";
export type { DebugSubTab, DebugTabPanelViewProps } from "./DebugTabPanelView";
export { DebugTabPanelView } from "./DebugTabPanelView";
export type { FileTabContentViewProps } from "./FileTabContentView";
export { FileTabContentView } from "./FileTabContentView";
export type {
	HtmlPreviewSegmentedControlProps,
	HtmlPreviewSegmentItem,
	HtmlPreviewViewLabels,
	HtmlPreviewViewProps,
} from "./HtmlPreviewView";
export { HtmlPreviewView } from "./HtmlPreviewView";
export type {
	JourneyFileItem,
	JourneyPanelViewLabels,
	JourneyPanelViewState,
	JourneyStageViewItem,
	JourneyTransferViewItem,
	JourneyUserIdentity,
} from "./JourneyPanelView";
export { JourneyPanelView } from "./JourneyPanelView";
export type {
	KnowledgeHistoryPanelViewLabels,
	KnowledgeHistoryPanelViewProps,
	KnowledgeHistorySessionItem,
} from "./KnowledgeHistoryPanelView";
export { KnowledgeHistoryPanelView } from "./KnowledgeHistoryPanelView";
export type { MarkdownPreviewViewProps } from "./MarkdownPreviewView";
export { MarkdownPreviewView } from "./MarkdownPreviewView";
export type {
	RequestHistoryItem,
	RequestHistorySubTabViewLabels,
	RequestHistorySubTabViewProps,
} from "./RequestHistorySubTabView";
export { RequestHistorySubTabView } from "./RequestHistorySubTabView";
export type {
	ScheduleExecutionTabPanelViewLabels,
	ScheduleExecutionTabPanelViewProps,
	ScheduleRecordItem,
	ScheduleSummaryCardItem,
	ScheduleTaskControlItem,
} from "./ScheduleExecutionTabPanelView";
export { ScheduleExecutionTabPanelView } from "./ScheduleExecutionTabPanelView";
export type { TodoTabPanelViewProps } from "./TodoTabPanelView";
export { TodoTabPanelView } from "./TodoTabPanelView";
export type {
	ToolCallFilterOption,
	ToolCallFilterValue,
	ToolCallsSubTabViewLabels,
	ToolCallsSubTabViewProps,
	ToolCallViewItem,
} from "./ToolCallsSubTabView";
export { ToolCallsSubTabView } from "./ToolCallsSubTabView";
