import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
	activityPanelWidthAtom,
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	activeSessionAtom,
	flowingChatUnreadAtom,
	todoItemsBySessionAtom,
	getTodoItemsForSession,
	debugModeAtom,
	inlineFilePreviewAtom,
	inlineFilePreviewContextReadonlyAtom,
	sidebarCollapsedAtom,
} from "@shared/store/atoms";
import { FilePreviewView, usePreviewNav } from "@domains/file-preview/components/FilePreviewView";
import { useProjectProfile, type ActivityTabKey } from "@shared/lib/project-profile";
import { FilesPanel } from "@domains/file-explorer/components/FilesPanel";
import { JourneyPanel } from "./JourneyPanel";
import { ChatTabPanel } from "./ChatTabPanel";
import { BatchProgressTabPanel } from "./BatchProgressTabPanel";
import { ScheduleExecutionTabPanel } from "./ScheduleExecutionTabPanel";
import { TodoTabPanel } from "./TodoTabPanel";
import { DebugTabPanel } from "./DebugTabPanel";
import { SegmentedControl, type SegmentedControlItem } from "@shared/components/ui/segmented-control";
import { ResizeHandle } from "@shared/components/ResizeHandle";

const MIN_WIDTH = 260;
const MAX_WIDTH = 600;

interface ActivityPanelProps {
	/** 显式指定 cwd（项目详情页用），不传则回退到当前活动 session */
	cwd?: string | null;
}

export function ActivityPanel({ cwd: cwdProp }: ActivityPanelProps = {}): JSX.Element {
	const isOpen = useAtomValue(activityPanelOpenAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const [width, setWidth] = useAtom(activityPanelWidthAtom);
	const [isResizing, setIsResizing] = useState(false);
	const [tabByProject, setTabByProject] = useAtom(activityPanelTabByProjectAtom);

	const inlinePreviewCtx = useAtomValue(inlineFilePreviewContextReadonlyAtom);
	const inlinePreviewActive = inlinePreviewCtx !== null;
	const setSidebarCollapsed = useSetAtom(sidebarCollapsedAtom);
	const previousSidebarStateRef = useRef<boolean | null>(null);

	// When inline preview opens, auto-collapse sidebar and remember previous state.
	// When it closes, restore the previous state.
	useEffect(() => {
		if (inlinePreviewActive) {
			if (previousSidebarStateRef.current === null) {
				let prev = false;
				setSidebarCollapsed((current) => {
					prev = current;
					return true;
				});
				previousSidebarStateRef.current = prev;
			}
		} else if (previousSidebarStateRef.current !== null) {
			const restore = previousSidebarStateRef.current;
			previousSidebarStateRef.current = null;
			setSidebarCollapsed(restore);
		}
	}, [inlinePreviewActive, setSidebarCollapsed]);

	const cwd = cwdProp ?? activeSession?.cwd ?? null;
	const { profile } = useProjectProfile(cwd);
	const unreadMap = useAtomValue(flowingChatUnreadAtom);
	const chatUnread = profile?.flowingId != null ? (unreadMap.get(profile.flowingId) ?? 0) : 0;
	const todoMap = useAtomValue(todoItemsBySessionAtom);
	const todoItems = useMemo(
		() => getTodoItemsForSession(todoMap, activeSession?.runtimeId ?? null),
		[todoMap, activeSession?.runtimeId],
	);
	const hasTodo = todoItems.length > 0;
	const debugMode = useAtomValue(debugModeAtom);

	const onResize = useCallback(
		(delta: number) => {
			setIsResizing(true);
			setWidth((w) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w + delta)));
		},
		[setWidth],
	);

	const onResizeEnd = useCallback(() => setIsResizing(false), []);

	const segmentedItems: SegmentedControlItem<ActivityTabKey>[] = useMemo(() => {
		const base: SegmentedControlItem<ActivityTabKey>[] = (profile?.activityTabs ?? []).map((t) => ({
			key: t.key,
			label: t.label,
			icon: t.icon,
			badge: t.key === "chat" ? chatUnread : undefined,
		}));
		// Dynamically inject todo tab when items exist
		if (hasTodo) {
			const todoDone = todoItems.filter((i) => i.status === "done").length;
			base.push({
				key: "todo" as ActivityTabKey,
				label: "待办",
				icon: "icon-[mdi--checkbox-marked-circle-outline]",
				badge: todoItems.length - todoDone > 0 ? todoItems.length - todoDone : undefined,
			});
		}
		// Dynamically inject debug tab when debug mode is enabled
		if (debugMode) {
			base.push({
				key: "debug" as ActivityTabKey,
				label: "调试",
				icon: "icon-[mdi--bug-outline]",
			});
		}
		return base;
	}, [profile, chatUnread, hasTodo, todoItems, debugMode]);

	// 当前 active tab：优先取项目记忆，否则用 profile 默认；profile 未就绪时退回 "file"
	const activeTab: ActivityTabKey = useMemo(() => {
		if (cwd) {
			const remembered = tabByProject.get(cwd);
			if (remembered && segmentedItems.some((t) => t.key === remembered)) {
				return remembered;
			}
		}
		return profile?.defaultActivityTab ?? "file";
	}, [cwd, tabByProject, profile, segmentedItems]);

	const onTabChange = useCallback(
		(next: ActivityTabKey) => {
			if (!cwd) return;
			setTabByProject((prev) => {
				const map = new Map(prev);
				map.set(cwd, next);
				return map;
			});
		},
		[cwd, setTabByProject],
	);

	return (
		<aside
			style={
				inlinePreviewActive
					? undefined
					: {
							width: isOpen ? width : 0,
							transition: isResizing ? "none" : "width 0.2s ease-in-out",
						}
			}
			className={
				inlinePreviewActive
					? "relative flex-1 min-w-0 overflow-hidden"
					: "relative shrink-0 overflow-hidden"
			}
		>
			<div
				className="flex h-full flex-col pb-2 pr-2"
				style={inlinePreviewActive ? undefined : { width }}
			>
				<div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-muted/50">
					{/* Tab list 顶栏 — 始终渲染（即便只有一个 tab） */}
					{segmentedItems.length > 0 && (
						<div className="flex shrink-0 items-center justify-start border-b border-border px-3 py-2">
							<SegmentedControl items={segmentedItems} value={activeTab} onChange={onTabChange} />
						</div>
					)}

					{/* cwd 作 key：切 session 时整块 remount，强制各 tab 的内部缓存/订阅按
					    新 cwd 重新拉取，避免上个 session 的卡片内容残留。 */}
					<div key={cwd ?? "__none__"} className="flex min-h-0 flex-1 flex-col">
						{activeTab === "file" && <FileTabContent cwd={cwd} />}
						{activeTab === "journey" && cwd && <JourneyPanel cwd={cwd} />}
						{activeTab === "chat" && cwd && <ChatTabPanel cwd={cwd} />}
						{activeTab === "batch-progress" && cwd && <BatchProgressTabPanel cwd={cwd} />}
						{activeTab === "schedule-records" && cwd && <ScheduleExecutionTabPanel cwd={cwd} />}
						{activeTab === "todo" && cwd && <TodoTabPanel />}
						{activeTab === "debug" && cwd && <DebugTabPanel cwd={cwd} />}
					</div>
				</div>
			</div>
			{isOpen && !inlinePreviewActive && (
				<ResizeHandle side="left" onResize={onResize} onResizeEnd={onResizeEnd} />
			)}
		</aside>
	);
}

function FileTabContent({ cwd }: { cwd: string | null }): JSX.Element {
	const [previewCtx, setPreviewCtx] = useAtom(inlineFilePreviewContextReadonlyAtom);
	const setPreview = useSetAtom(inlineFilePreviewAtom);
	const { goPrev, goNext, close } = usePreviewNav((updater) => {
		if (typeof updater === "function") {
			setPreviewCtx(updater(previewCtx));
		} else {
			setPreview(updater);
		}
	});

	if (previewCtx) {
		return (
			<div className="flex min-h-0 flex-1 overflow-hidden">
				{/* Left: file tree (compressed) */}
				<div className="flex w-[260px] shrink-0 flex-col overflow-hidden border-r border-border/50">
					<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
						<FilesPanel cwd={cwd} />
					</div>
				</div>
				{/* Right: preview */}
				<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
					<FilePreviewView
						ctx={previewCtx}
						onPrev={goPrev}
						onNext={goNext}
						onClose={close}
						canPrev={previewCtx.index > 0}
						canNext={previewCtx.index < previewCtx.items.length - 1}
						enableKeyboard
					/>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<FilesPanel cwd={cwd} />
		</div>
	);
}
