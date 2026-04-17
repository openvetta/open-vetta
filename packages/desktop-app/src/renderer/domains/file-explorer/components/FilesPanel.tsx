import { useEffect, useCallback } from "react";
import { useFileTree } from "../hooks/useFileTree";
import { FileTree } from "./FileTree";
import { FileContextMenu } from "./FileContextMenu";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
	fileContextMenuAtom,
	filePreviewAtom,
	filePreviewContextReadonlyAtom,
	type FilePreviewItem,
	type FsEntry,
} from "@shared/store/atoms";
import { useState } from "react";
import { Button } from "@shared/components/ui/button";
import { pathBasename, pathDirname } from "@shared/lib/utils";

interface FilesPanelProps {
	/** 显式根目录（项目详情页等无 active session 场景使用） */
	cwd?: string | null;
}

export function FilesPanel({ cwd }: FilesPanelProps = {}): JSX.Element {
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
	} = useFileTree(cwd);

	const [contextMenu, setContextMenu] = useAtom(fileContextMenuAtom);
	const setPreview = useSetAtom(filePreviewAtom);
	const previewCtx = useAtomValue(filePreviewContextReadonlyAtom);
	const [deleteTarget, setDeleteTarget] = useState<FsEntry | null>(null);
	const [errorToast, setErrorToast] = useState<string | null>(null);

	const handleSelectFile = useCallback(
		(entry: FsEntry) => {
			// 优先按 pathDirname 取同目录列表
			const dir = pathDirname(entry.path);
			let siblings: FsEntry[] = (cache.get(dir) ?? []).filter((e) => !e.isDirectory);

			// 兜底 1：在 Windows 上 cache key 与 pathDirname 可能因分隔符差异而未命中，
			// 直接遍历 cache 找到包含当前文件的目录列表
			if (siblings.length === 0) {
				for (const entries of cache.values()) {
					if (entries.some((e) => e.path === entry.path)) {
						siblings = entries.filter((e) => !e.isDirectory);
						break;
					}
				}
			}

			// 兜底 2：仍未找到则只预览当前文件
			if (siblings.length === 0) {
				siblings = [entry];
			}

			const items: FilePreviewItem[] = siblings.map((e) => ({
				name: e.name,
				path: e.path,
				size: e.size,
			}));
			const idx = items.findIndex((it) => it.path === entry.path);
			setPreview({ items, index: idx >= 0 ? idx : 0 });
		},
		[cache, setPreview],
	);

	// 当前选中的文件路径（来自全局预览上下文，仅当预览来源为本地路径时高亮）
	const selectedPath = previewCtx?.items[previewCtx.index]?.path ?? null;

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
				<span className="icon-[mdi--folder-search-outline] h-7 w-7 text-muted-foreground" />
				<p className="text-[11px] text-foreground">
					选择一个项目以浏览文件
				</p>
			</div>
		);
	}

	const projectName = pathBasename(rootDir);

	return (
		<>
			{/* Header with project name + refresh */}
			<div className="flex items-center justify-between px-3 py-1.5">
				<span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
					{projectName}
				</span>
				<Button variant="ghost" size="icon-xs" title="刷新" onClick={() => void refreshDir(rootDir)}>
					<span className="icon-[mdi--refresh] h-3.5 w-3.5" />
				</Button>
			</div>

			{/* Loading indicator for root */}
			{loadingDirs.has(rootDir) && !cache.has(rootDir) ? (
				<div className="flex items-center justify-center py-8">
					<span className="icon-[mdi--loading] h-5 w-5 animate-spin text-muted-foreground" />
				</div>
			) : (
				<FileTree
					rootDir={rootDir}
					cache={cache}
					expandedDirs={expandedDirs}
					loadingDirs={loadingDirs}
					selectedPath={selectedPath}
					onToggleDir={toggleDir}
					onSelectFile={handleSelectFile}
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
				<div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-destructive px-3 py-1.5 text-[12px] text-white shadow-lg">
					{errorToast}
				</div>
			)}
		</>
	);
}
