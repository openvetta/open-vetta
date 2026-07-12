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
export type { CodePreviewProps } from "./CodePreview";
export { CodePreview } from "./CodePreview";
export type { DebugSubTab, DebugTabPanelViewProps } from "./DebugTabPanelView";
export { DebugTabPanelView } from "./DebugTabPanelView";
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
