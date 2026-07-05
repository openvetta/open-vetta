import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { FilesPanel } from "@domains/file-explorer/components/FilesPanel";
import { FilePreviewView, usePreviewNav } from "@domains/file-preview/components/FilePreviewView";
import { ResizeHandle } from "@shared/components/ResizeHandle";
import {
	ACTIVITY_PANEL_PREVIEW_MIN_WIDTH,
	activityPanelWidthAtom,
	closeInlineFilePreviewAtom,
	inlineFilePreviewAtom,
	inlineFilePreviewContextReadonlyAtom,
} from "@shared/store/atoms";

const TREE_DEFAULT_WIDTH = 220;
const TREE_MIN_WIDTH = 160;
const TREE_MAX_WIDTH = 360;
const PREVIEW_MOUNT_DELAY_MS = 240;

interface FileTabContentProps {
	cwd: string | null;
}

export function FileTabContent({ cwd }: FileTabContentProps): JSX.Element {
	const [previewCtx, setPreviewCtx] = useAtom(inlineFilePreviewContextReadonlyAtom);
	const setPreview = useSetAtom(inlineFilePreviewAtom);
	const closePreview = useSetAtom(closeInlineFilePreviewAtom);
	const width = useAtomValue(activityPanelWidthAtom);
	const { goPrev, goNext } = usePreviewNav((updater) => {
		if (typeof updater === "function") {
			setPreviewCtx(updater(previewCtx));
		} else {
			setPreview(updater);
		}
	});

	const showPreview = previewCtx !== null && width >= ACTIVITY_PANEL_PREVIEW_MIN_WIDTH;
	const [previewMounted, setPreviewMounted] = useState(false);
	useEffect(() => {
		if (!showPreview) {
			setPreviewMounted(false);
			return;
		}
		const timer = setTimeout(() => setPreviewMounted(true), PREVIEW_MOUNT_DELAY_MS);
		return () => clearTimeout(timer);
	}, [showPreview]);

	const [treeWidth, setTreeWidth] = useState(TREE_DEFAULT_WIDTH);
	const onTreeResize = useCallback((delta: number) => {
		setTreeWidth((currentWidth) => Math.max(TREE_MIN_WIDTH, Math.min(TREE_MAX_WIDTH, currentWidth + delta)));
	}, []);

	const [treeCollapsed, setTreeCollapsed] = useState(false);
	const toggleTree = useCallback(() => setTreeCollapsed((collapsed) => !collapsed), []);
	useEffect(() => {
		if (!showPreview) setTreeCollapsed(false);
	}, [showPreview]);

	useEffect(() => () => closePreview(), [closePreview]);

	const showTree = !showPreview || !treeCollapsed;
	return (
		<div className="flex min-h-0 flex-1 overflow-hidden">
			{showTree && (
				<div
					className={
						showPreview
							? "relative flex min-h-0 shrink-0 flex-col overflow-hidden border-r border-border/50"
							: "flex min-h-0 flex-1 flex-col overflow-hidden"
					}
					style={showPreview ? { width: treeWidth } : undefined}
				>
					<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
						<FilesPanel cwd={cwd} />
					</div>
					{showPreview && <ResizeHandle side="right" onResize={onTreeResize} />}
				</div>
			)}
			{showPreview && previewCtx && (
				<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
					{previewMounted ? (
						<FilePreviewView
							ctx={previewCtx}
							onPrev={goPrev}
							onNext={goNext}
							onClose={closePreview}
							canPrev={previewCtx.index > 0}
							canNext={previewCtx.index < previewCtx.items.length - 1}
							enableKeyboard
							onToggleSidebar={toggleTree}
							sidebarCollapsed={treeCollapsed}
						/>
					) : (
						<div className="flex min-h-0 flex-1" />
					)}
				</div>
			)}
		</div>
	);
}
