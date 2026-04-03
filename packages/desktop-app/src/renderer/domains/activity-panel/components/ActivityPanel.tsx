import { useCallback, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { activityPanelWidthAtom, activityPanelOpenAtom, selectedFilePathAtom } from "@shared/store/atoms";
import { ActivityPanelHeader } from "./ActivityPanelHeader";
import { FilePreview, isZoomableExtension } from "./FilePreview";
import { ResizeHandle } from "@shared/components/ResizeHandle";

const MIN_WIDTH = 260;
const MAX_WIDTH = 600;

export function ActivityPanel(): JSX.Element {
	const isOpen = useAtomValue(activityPanelOpenAtom);
	const selectedPath = useAtomValue(selectedFilePathAtom);
	const [width, setWidth] = useAtom(activityPanelWidthAtom);
	const [isResizing, setIsResizing] = useState(false);

	const onResize = useCallback(
		(delta: number) => {
			setIsResizing(true);
			setWidth((w) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w + delta)));
		},
		[setWidth],
	);

	const onResizeEnd = useCallback(() => setIsResizing(false), []);

	const zoomable = selectedPath ? isZoomableExtension(selectedPath) : false;

	return (
		<aside
			style={{
				width: isOpen ? width : 0,
				transition: isResizing ? "none" : "width 0.2s ease-in-out",
			}}
			className="relative shrink-0 overflow-hidden"
		>
			<div className="flex h-full flex-col pb-2 pr-2" style={{ width }}>
				<div className="flex flex-1 flex-col overflow-hidden rounded-xl bg-muted/50 ring-1 ring-border/60 shadow-sm">
					{selectedPath ? (
						<>
							<ActivityPanelHeader filePath={selectedPath} />
							{/* Zoomable content (image/pdf): flex fill, no outer scroll.
							    Other content (code/md/docx): scroll container. */}
							<div className={zoomable ? "flex flex-1 flex-col overflow-hidden" : "flex-1 overflow-y-auto"}>
								<FilePreview filePath={selectedPath} />
							</div>
						</>
					) : (
						<div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground/50">
							<span className="icon-[mdi--dock-right] text-[32px]" />
							<span className="text-[12px]">从侧边栏选择文件以预览</span>
						</div>
					)}
				</div>
			</div>
			{isOpen && <ResizeHandle side="left" onResize={onResize} onResizeEnd={onResizeEnd} />}
		</aside>
	);
}
