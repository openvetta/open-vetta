import { useCallback } from "react";
import { useAtom, useAtomValue } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { activityPanelWidthAtom, activityPanelOpenAtom, selectedFilePathAtom } from "../../store/atoms";
import { ActivityPanelHeader } from "./ActivityPanelHeader";
import { FilePreview, isZoomableExtension } from "./FilePreview";
import { ResizeHandle } from "../ResizeHandle";

const MIN_WIDTH = 260;
const MAX_WIDTH = 600;

export function ActivityPanel(): JSX.Element {
	const isOpen = useAtomValue(activityPanelOpenAtom);
	const selectedPath = useAtomValue(selectedFilePathAtom);
	const [width, setWidth] = useAtom(activityPanelWidthAtom);

	const onResize = useCallback(
		(delta: number) => {
			setWidth((w) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w + delta)));
		},
		[setWidth],
	);

	const zoomable = selectedPath ? isZoomableExtension(selectedPath) : false;

	return (
		<AnimatePresence>
			{isOpen && (
				<motion.aside
					initial={{ width: 0, opacity: 0 }}
					animate={{ width, opacity: 1 }}
					exit={{ width: 0, opacity: 0 }}
					transition={{ duration: 0.2, ease: "easeInOut" }}
					className="relative shrink-0 overflow-hidden rounded-lg bg-[var(--content-bg)] ml-1.5"
					style={{
						border: "var(--panel-border)",
						boxShadow: "var(--panel-shadow)",
					}}
				>
					<div className="flex h-full flex-col" style={{ width }}>
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
							<div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--text-3)]">
								<span className="icon-[mdi--dock-right] text-[32px]" />
								<span className="text-[12px]">从侧边栏选择文件以预览</span>
							</div>
						)}
					</div>
					<ResizeHandle side="left" onResize={onResize} />
				</motion.aside>
			)}
		</AnimatePresence>
	);
}
