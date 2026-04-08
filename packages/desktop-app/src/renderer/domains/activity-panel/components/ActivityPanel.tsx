import { useCallback, useMemo, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import {
	activityPanelWidthAtom,
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	activeSessionAtom,
	flowingChatUnreadAtom,
} from "@shared/store/atoms";
import { useProjectProfile, type ActivityTabKey } from "@shared/lib/project-profile";
import { FilesPanel } from "@domains/file-explorer/components/FilesPanel";
import { JourneyPanel } from "./JourneyPanel";
import { ChatTabPanel } from "./ChatTabPanel";
import { BatchProgressTabPanel } from "./BatchProgressTabPanel";
import { ScheduleExecutionTabPanel } from "./ScheduleExecutionTabPanel";
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

	const cwd = cwdProp ?? activeSession?.cwd ?? null;
	const { profile } = useProjectProfile(cwd);
	const unreadMap = useAtomValue(flowingChatUnreadAtom);
	const chatUnread = profile?.flowingId != null ? (unreadMap.get(profile.flowingId) ?? 0) : 0;

	const onResize = useCallback(
		(delta: number) => {
			setIsResizing(true);
			setWidth((w) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w + delta)));
		},
		[setWidth],
	);

	const onResizeEnd = useCallback(() => setIsResizing(false), []);

	// 当前 active tab：优先取项目记忆，否则用 profile 默认；profile 未就绪时退回 "file"
	const activeTab: ActivityTabKey = useMemo(() => {
		if (cwd) {
			const remembered = tabByProject.get(cwd);
			if (remembered && profile?.activityTabs.some((t) => t.key === remembered)) {
				return remembered;
			}
		}
		return profile?.defaultActivityTab ?? "file";
	}, [cwd, tabByProject, profile]);

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

	const segmentedItems: SegmentedControlItem<ActivityTabKey>[] = useMemo(
		() =>
			(profile?.activityTabs ?? []).map((t) => ({
				key: t.key,
				label: t.label,
				icon: t.icon,
				badge: t.key === "chat" ? chatUnread : undefined,
			})),
		[profile, chatUnread],
	);

	return (
		<aside
			style={{
				width: isOpen ? width : 0,
				transition: isResizing ? "none" : "width 0.2s ease-in-out",
			}}
			className="relative shrink-0 overflow-hidden"
		>
			<div className="flex h-full flex-col pb-2 pr-2" style={{ width }}>
				<div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-muted/50">
					{/* Tab list 顶栏 — 始终渲染（即便只有一个 tab） */}
					{segmentedItems.length > 0 && (
						<div className="flex shrink-0 items-center justify-start border-b border-border px-3 py-2">
							<SegmentedControl items={segmentedItems} value={activeTab} onChange={onTabChange} />
						</div>
					)}

					<div className="flex min-h-0 flex-1 flex-col">
						{activeTab === "file" && <FileTabContent cwd={cwd} />}
						{activeTab === "journey" && cwd && <JourneyPanel cwd={cwd} />}
						{activeTab === "chat" && cwd && <ChatTabPanel cwd={cwd} />}
						{activeTab === "batch-progress" && cwd && <BatchProgressTabPanel cwd={cwd} />}
						{activeTab === "schedule-records" && cwd && <ScheduleExecutionTabPanel cwd={cwd} />}
					</div>
				</div>
			</div>
			{isOpen && <ResizeHandle side="left" onResize={onResize} onResizeEnd={onResizeEnd} />}
		</aside>
	);
}

function FileTabContent({ cwd }: { cwd: string | null }): JSX.Element {
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<FilesPanel cwd={cwd} />
		</div>
	);
}
