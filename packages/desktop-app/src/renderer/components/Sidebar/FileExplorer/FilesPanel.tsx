import { useEffect, useCallback } from "react";
import { useFileTree } from "../../../hooks/useFileTree";
import { FileTree } from "./FileTree";
import { FileContextMenu } from "./FileContextMenu";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { useAtom } from "jotai";
import { fileContextMenuAtom, type FsEntry } from "../../../store/atoms";
import { useState } from "react";

export function FilesPanel(): JSX.Element {
	const {
		cache,
		expandedDirs,
		loadingDirs,
		rootDir,
		toggleDir,
		renameEntry,
		deleteEntry,
		moveEntry,
		refreshDir,
	} = useFileTree();

	const [contextMenu, setContextMenu] = useAtom(fileContextMenuAtom);
	const [deleteTarget, setDeleteTarget] = useState<FsEntry | null>(null);
	const [errorToast, setErrorToast] = useState<string | null>(null);

	// Listen for drag-drop move events
	useEffect(() => {
		function handleMove(e: Event) {
			const { srcPath, destDir } = (e as CustomEvent).detail as { srcPath: string; destDir: string };
			void moveEntry(srcPath, destDir).catch((err: unknown) => {
				setErrorToast(err instanceof Error ? err.message : "移动失败");
			});
		}
		window.addEventListener("vetta:file-move", handleMove);
		return () => window.removeEventListener("vetta:file-move", handleMove);
	}, [moveEntry]);

	// Auto-dismiss error toast
	useEffect(() => {
		if (!errorToast) return;
		const timer = setTimeout(() => setErrorToast(null), 3000);
		return () => clearTimeout(timer);
	}, [errorToast]);

	const handleDelete = useCallback(async () => {
		if (!deleteTarget) return;
		try {
			await deleteEntry(deleteTarget.path);
		} catch (err: unknown) {
			setErrorToast(err instanceof Error ? err.message : "删除失败");
		}
		setDeleteTarget(null);
	}, [deleteTarget, deleteEntry]);

	if (!rootDir) {
		return (
			<div className="flex flex-col items-center gap-2.5 px-4 py-10 text-center">
				<span className="icon-[mdi--folder-search-outline] h-7 w-7 text-[var(--text-3)]" />
				<p className="text-[11px] text-[var(--text-3)]">
					选择一个项目以浏览文件
				</p>
			</div>
		);
	}

	const projectName = rootDir.substring(rootDir.lastIndexOf("/") + 1);

	return (
		<>
			{/* Header with project name + refresh */}
			<div className="flex items-center justify-between px-3 py-1.5">
				<span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">
					{projectName}
				</span>
				<button
					type="button"
					title="刷新"
					onClick={() => void refreshDir(rootDir)}
					className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-3)] hover:bg-[var(--hover-strong)] hover:text-[var(--text-2)]"
				>
					<span className="icon-[mdi--refresh] h-3.5 w-3.5" />
				</button>
			</div>

			{/* Loading indicator for root */}
			{loadingDirs.has(rootDir) && !cache.has(rootDir) ? (
				<div className="flex items-center justify-center py-8">
					<span className="icon-[mdi--loading] h-5 w-5 animate-spin text-[var(--text-3)]" />
				</div>
			) : (
				<FileTree
					rootDir={rootDir}
					cache={cache}
					expandedDirs={expandedDirs}
					loadingDirs={loadingDirs}
					onToggleDir={toggleDir}
					onRename={renameEntry}
				/>
			)}

			{/* Context menu */}
			{contextMenu && (
				<FileContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					entry={contextMenu.entry}
					onClose={() => setContextMenu(null)}
					onDelete={(entry) => {
						setContextMenu(null);
						setDeleteTarget(entry);
					}}
				/>
			)}

			{/* Delete confirmation dialog */}
			{deleteTarget && (
				<ConfirmDeleteDialog
					entry={deleteTarget}
					onConfirm={() => void handleDelete()}
					onCancel={() => setDeleteTarget(null)}
				/>
			)}

			{/* Error toast */}
			{errorToast && (
				<div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-[var(--tool-error)] px-3 py-1.5 text-[12px] text-white shadow-lg">
					{errorToast}
				</div>
			)}
		</>
	);
}
