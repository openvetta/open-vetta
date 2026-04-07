import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import {
	activityPanelWidthAtom,
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	selectedFilePathAtom,
	activeSessionAtom,
} from "@shared/store/atoms";
import { useProjectProfile, type ActivityTabKey } from "@shared/lib/project-profile";
import { ActivityPanelHeader } from "./ActivityPanelHeader";
import { FilePreview, isZoomableExtension } from "./FilePreview";
import { JourneyPanel } from "./JourneyPanel";
import { ChatTabPanel } from "./ChatTabPanel";
import { SegmentedControl, type SegmentedControlItem } from "@shared/components/ui/segmented-control";
import { ResizeHandle } from "@shared/components/ResizeHandle";

const MIN_WIDTH = 260;
const MAX_WIDTH = 600;

export function ActivityPanel(): JSX.Element {
	const isOpen = useAtomValue(activityPanelOpenAtom);
	const selectedPath = useAtomValue(selectedFilePathAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const [width, setWidth] = useAtom(activityPanelWidthAtom);
	const [isResizing, setIsResizing] = useState(false);
	const [tabByProject, setTabByProject] = useAtom(activityPanelTabByProjectAtom);

	const cwd = activeSession?.cwd ?? null;
	const { profile } = useProjectProfile(cwd);

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

	// 选中文件后自动切到文件 tab（任何项目类型都生效）
	useEffect(() => {
		if (!cwd || !selectedPath) return;
		setTabByProject((prev) => {
			if (prev.get(cwd) === "file") return prev;
			const map = new Map(prev);
			map.set(cwd, "file");
			return map;
		});
	}, [cwd, selectedPath, setTabByProject]);

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
			})),
		[profile],
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
						<div className="flex shrink-0 items-center justify-center border-b border-border px-3 py-2">
							<SegmentedControl items={segmentedItems} value={activeTab} onChange={onTabChange} />
						</div>
					)}

					<div className="flex min-h-0 flex-1 flex-col">
						{activeTab === "file" && <FileTabContent selectedPath={selectedPath} />}
						{activeTab === "journey" && cwd && <JourneyPanel cwd={cwd} />}
						{activeTab === "chat" && cwd && <ChatTabPanel cwd={cwd} />}
					</div>
				</div>
			</div>
			{isOpen && <ResizeHandle side="left" onResize={onResize} onResizeEnd={onResizeEnd} />}
		</aside>
	);
}

function FileTabContent({ selectedPath }: { selectedPath: string | null }): JSX.Element {
	const zoomable = selectedPath ? isZoomableExtension(selectedPath) : false;
	if (!selectedPath) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground/50">
				<span className="icon-[mdi--dock-right] text-[32px]" />
				<span className="text-[12px]">从侧边栏选择文件以预览</span>
			</div>
		);
	}
	return (
		<>
			<ActivityPanelHeader filePath={selectedPath} />
			<div className={zoomable ? "flex flex-1 flex-col overflow-hidden" : "flex-1 overflow-y-auto"}>
				<FilePreview filePath={selectedPath} />
			</div>
		</>
	);
}
