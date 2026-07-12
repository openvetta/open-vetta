import { type JSX, type ReactNode } from "react";
import { ResizeHandle } from "../layout/ResizeHandle";

export interface FileTabContentViewProps {
	showTree: boolean;
	showPreview: boolean;
	treeWidth: number;
	onTreeResize: (delta: number) => void;
	/** Host file tree panel. */
	tree: ReactNode;
	/** Host preview panel (null when not showing). */
	preview: ReactNode;
}

/**
 * File tab split layout: tree + optional preview. Host injects FilesPanel / FilePreviewView.
 */
export function FileTabContentView({
	showTree,
	showPreview,
	treeWidth,
	onTreeResize,
	tree,
	preview,
}: FileTabContentViewProps): JSX.Element {
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
					<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{tree}</div>
					{showPreview && <ResizeHandle side="right" onResize={onTreeResize} />}
				</div>
			)}
			{showPreview && preview && (
				<div className="flex min-w-0 flex-1 flex-col overflow-hidden">{preview}</div>
			)}
		</div>
	);
}
