import { useEffect, useCallback } from "react";
import { useFileTree } from "../hooks/useFileTree";
import { FileTree } from "./FileTree";
import { FileContextMenu } from "./FileContextMenu";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
	activityPanelWidthAtom,
	ACTIVITY_PANEL_PREVIEW_MIN_WIDTH,
	confirmDialogAtom,
	defaultConversationCwdAtom,
	defaultImConversationCwdAtom,
	fileContextMenuAtom,
	filePreviewAtom,
	getProjectDisplayName,
	inlineFilePreviewAtom,
	inlineFilePreviewContextReadonlyAtom,
	openInlineFilePreviewAtom,
	type FilePreviewItem,
	type FsEntry,
} from "@shared/store/atoms";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@shared/components/ui/button";
import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
import { pathDirname } from "@shared/lib/utils";

interface FilesPanelProps {
	/** 显式根目录（项目详情页等无 active session 场景使用） */
	cwd?: string | null;
}

export function FilesPanel({ cwd }: FilesPanelProps = {}): JSX.Element {
	const { t } = useTranslation("chat");
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
	const setPreview = useSetAtom(inlineFilePreviewAtom);
	const openInlinePreview = useSetAtom(openInlineFilePreviewAtom);
	const setGlobalPreview = useSetAtom(filePreviewAtom);
	const narrow = useNarrowScreen();
	const previewCtx = useAtomValue(inlineFilePreviewContextReadonlyAtom);
	const panelWidth = useAtomValue(activityPanelWidthAtom);
	const [deleteTarget, setDeleteTarget] = useState<FsEntry | null>(null);
	const [errorToast, setErrorToast] = useState<string | null>(null);
	const defaultCwd = useAtomValue(defaultConversationCwdAtom);
	const imCwd = useAtomValue(defaultImConversationCwdAtom);
	const setConfirm = useSetAtom(confirmDialogAtom);

	const clearArtifactsScope: "conversation" | "claw" | null =
		rootDir && defaultCwd && rootDir === defaultCwd
			? "conversation"
			: rootDir && imCwd && rootDir === imCwd
				? "claw"
				: null;

	const handleClearArtifacts = useCallback(() => {
		if (!clearArtifactsScope || !rootDir) return;
		const label = clearArtifactsScope === "claw" ? "Claw" : t("fileExplorer.conversationLabel");
		setConfirm({
			title: t("fileExplorer.clearArtifactsTitle"),
			message: t("fileExplorer.clearArtifactsMessage", { label }),
			confirmLabel: t("fileExplorer.clearArtifactsConfirm"),
			variant: "danger",
			onConfirm: async () => {
				try {
					await window.vetta.session.clearDefaultArtifacts(clearArtifactsScope);
				} catch (err: unknown) {
					setErrorToast(err instanceof Error ? err.message : t("fileExplorer.clearArtifactsFailed"));
					return;
				}
				await refreshDir(rootDir);
			},
		});
	}, [clearArtifactsScope, rootDir, setConfirm, refreshDir, t]);

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
			const ctx = { items, index: idx >= 0 ? idx : 0 };
			// 窄屏：活动面板是底部 sheet，内嵌分屏预览会把内容挤窄，
			// 改走全局预览 Dialog（覆盖整屏），不走内嵌拉伸预览。
			if (narrow) {
				setGlobalPreview(ctx);
			} else {
				// 显式点击：经 host API 把面板拉到 max 再展示预览（宽度回拉由关闭逻辑接管）。
				openInlinePreview(ctx);
			}
		},
		[cache, narrow, openInlinePreview, setGlobalPreview],
	);

	// 当前选中的文件路径（来自全局预览上下文，仅当预览来源为本地路径时高亮）
	const selectedPath = previewCtx?.items[previewCtx.index]?.path ?? null;

	// 面板被拖宽到阈值、但还没选中文件时，默认选中根目录下第一个文件（不主动改宽度）。
	useEffect(() => {
		if (narrow || previewCtx != null || !rootDir) return;
		if (panelWidth < ACTIVITY_PANEL_PREVIEW_MIN_WIDTH) return;
		const files = (cache.get(rootDir) ?? []).filter((e) => !e.isDirectory);
		if (files.length === 0) return;
		const items: FilePreviewItem[] = files.map((e) => ({ name: e.name, path: e.path, size: e.size }));
		setPreview({ items, index: 0 });
	}, [narrow, previewCtx, rootDir, panelWidth, cache, setPreview]);

	// Listen for drag-drop move events
	useEffect(() => {
		function handleMove(e: Event) {
			const { srcPath, destDir } = (e as CustomEvent).detail as { srcPath: string; destDir: string };
			void moveEntry(srcPath, destDir).catch((err: unknown) => {
				setErrorToast(err instanceof Error ? err.message : t("fileExplorer.moveFailed"));
			});
		}
		window.addEventListener("vetta:file-move", handleMove);
		return () => window.removeEventListener("vetta:file-move", handleMove);
	}, [moveEntry, t]);

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
			setErrorToast(err instanceof Error ? err.message : t("fileExplorer.deleteFailed"));
		}
		setDeleteTarget(null);
	}, [deleteTarget, deleteEntry, t]);

	if (!rootDir) {
		return (
			<div className="flex flex-col items-center gap-2.5 px-4 py-10 text-center">
				<span className="icon-[mdi--folder-search-outline] h-7 w-7 text-muted-foreground" />
				<p className="text-[11px] text-foreground">
					{t("fileExplorer.selectProject")}
				</p>
			</div>
		);
	}

	const projectName = getProjectDisplayName(rootDir, defaultCwd);

	// ADR-0007: 「对话」/ Claw 项目下 session 的 rootDir 是 `<root>/<uuid>` 子目录，
	// 直接 basename 出来是 UUID，没有可读性也无信息量；这里隐藏 name，只保留右侧操作按钮。
	const isHashedSubCwd = (() => {
		const root = defaultCwd && rootDir.startsWith(`${defaultCwd}/`) ? defaultCwd : imCwd && rootDir.startsWith(`${imCwd}/`) ? imCwd : null;
		if (!root) return false;
		const rest = rootDir.slice(root.length + 1);
		return rest.length > 0 && !rest.includes("/");
	})();

	return (
		<>
			{/* Header with project name + refresh */}
			<div className="flex items-center justify-between px-3 py-1.5">
				<span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
					{isHashedSubCwd ? t("fileExplorer.fileList") : projectName}
				</span>
				<div className="flex items-center gap-0.5">
					{clearArtifactsScope && (
						<Button
							variant="ghost"
							size="icon-xs"
							title={t("fileExplorer.clearArtifacts")}
							onClick={handleClearArtifacts}
						>
							<span className="icon-[mdi--broom] h-3.5 w-3.5" />
						</Button>
					)}
					<Button variant="ghost" size="icon-xs" title={t("fileExplorer.refresh")} onClick={() => void refreshDir(rootDir)}>
						<span className="icon-[mdi--refresh] h-3.5 w-3.5" />
					</Button>
				</div>
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
