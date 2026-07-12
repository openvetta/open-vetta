import { Button } from "@shared/components/ui/button";
import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
import { pathDirname } from "@shared/lib/utils";
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
import type { FilesPanelViewProps } from "@vetta/theme-ui/file-explorer";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDeleteDialog } from "../components/ConfirmDeleteDialog";
import { FileContextMenu } from "../components/FileContextMenu";
import { FileTree } from "../components/FileTree";
import { useFileTree } from "./useFileTree";

export function useFilesPanelModel(cwd?: string | null): FilesPanelViewProps {
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
			const dir = pathDirname(entry.path);
			let siblings: FsEntry[] = (cache.get(dir) ?? []).filter((e) => !e.isDirectory);

			if (siblings.length === 0) {
				for (const entries of cache.values()) {
					if (entries.some((e) => e.path === entry.path)) {
						siblings = entries.filter((e) => !e.isDirectory);
						break;
					}
				}
			}

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
			if (narrow) {
				setGlobalPreview(ctx);
			} else {
				openInlinePreview(ctx);
			}
		},
		[cache, narrow, openInlinePreview, setGlobalPreview],
	);

	const selectedPath = previewCtx?.items[previewCtx.index]?.path ?? null;

	useEffect(() => {
		if (narrow || previewCtx != null || !rootDir) return;
		if (panelWidth < ACTIVITY_PANEL_PREVIEW_MIN_WIDTH) return;
		const files = (cache.get(rootDir) ?? []).filter((e) => !e.isDirectory);
		if (files.length === 0) return;
		const items: FilePreviewItem[] = files.map((e) => ({ name: e.name, path: e.path, size: e.size }));
		setPreview({ items, index: 0 });
	}, [narrow, previewCtx, rootDir, panelWidth, cache, setPreview]);

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

	const onFileMove = useCallback(
		(srcPath: string, destDir: string) => {
			void moveEntry(srcPath, destDir).catch((err: unknown) => {
				setErrorToast(err instanceof Error ? err.message : t("fileExplorer.moveFailed"));
			});
		},
		[moveEntry, t],
	);

	const onContextMenu = useCallback(
		(entry: FsEntry, x: number, y: number) => {
			setContextMenu({ x, y, entry });
		},
		[setContextMenu],
	);

	if (!rootDir) {
		return {
			rootDir: null,
			labels: {
				selectProject: t("fileExplorer.selectProject"),
				headerTitle: "",
			},
			refreshButton: null,
			loadingRoot: false,
			tree: null,
			contextMenu: null,
			deleteDialog: null,
			errorToast,
		};
	}

	const projectName = getProjectDisplayName(rootDir, defaultCwd);
	const isHashedSubCwd = (() => {
		const root =
			defaultCwd && rootDir.startsWith(`${defaultCwd}/`)
				? defaultCwd
				: imCwd && rootDir.startsWith(`${imCwd}/`)
					? imCwd
					: null;
		if (!root) return false;
		const rest = rootDir.slice(root.length + 1);
		return rest.length > 0 && !rest.includes("/");
	})();

	const clearArtifactsButton: ReactNode = clearArtifactsScope ? (
		<Button
			variant="ghost"
			size="icon-xs"
			title={t("fileExplorer.clearArtifacts")}
			onClick={handleClearArtifacts}
		>
			<span className="icon-[mdi--broom] h-3.5 w-3.5" />
		</Button>
	) : undefined;

	const refreshButton = (
		<Button
			variant="ghost"
			size="icon-xs"
			title={t("fileExplorer.refresh")}
			onClick={() => void refreshDir(rootDir)}
		>
			<span className="icon-[mdi--refresh] h-3.5 w-3.5" />
		</Button>
	);

	const tree = (
		<FileTree
			rootDir={rootDir}
			cache={cache}
			expandedDirs={expandedDirs}
			loadingDirs={loadingDirs}
			selectedPath={selectedPath}
			onToggleDir={toggleDir}
			onSelectFile={handleSelectFile}
			onRename={renameEntry}
			onFileMove={onFileMove}
			onContextMenu={onContextMenu}
		/>
	);

	const contextMenuNode = contextMenu ? (
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
	) : null;

	const deleteDialog = deleteTarget ? (
		<ConfirmDeleteDialog
			entry={deleteTarget}
			onConfirm={() => void handleDelete()}
			onCancel={() => setDeleteTarget(null)}
		/>
	) : null;

	return {
		rootDir,
		labels: {
			selectProject: t("fileExplorer.selectProject"),
			headerTitle: isHashedSubCwd ? t("fileExplorer.fileList") : projectName,
		},
		clearArtifactsButton,
		refreshButton,
		loadingRoot: loadingDirs.has(rootDir) && !cache.has(rootDir),
		tree,
		contextMenu: contextMenuNode,
		deleteDialog,
		errorToast,
	};
}
