import { isMac } from "@shared/lib/platform";
import { type FsEntry, renamingPathAtom } from "@shared/store/atoms";
import type { FileContextMenuViewProps } from "@vetta/theme-ui/file-explorer";
import { useSetAtom } from "jotai";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

export function useFileContextMenuModel(
	entry: FsEntry,
	onClose: () => void,
	onDelete: (entry: FsEntry) => void,
): FileContextMenuViewProps {
	const { t } = useTranslation("chat");
	const setRenamingPath = useSetAtom(renamingPathAtom);

	const onOpenInFolder = useCallback(() => {
		if (entry.isDirectory) {
			void window.vetta.shell.showInFolder(entry.path);
		} else {
			void window.vetta.shell.showItemInFolder(entry.path);
		}
		onClose();
	}, [entry, onClose]);

	const onCopyName = useCallback(() => {
		void navigator.clipboard.writeText(entry.name);
		onClose();
	}, [entry.name, onClose]);

	const onRename = useCallback(() => {
		setRenamingPath(entry.path);
		onClose();
	}, [entry.path, onClose, setRenamingPath]);

	const handleDelete = useCallback(() => {
		onDelete(entry);
	}, [entry, onDelete]);

	return {
		x: 0,
		y: 0,
		labels: {
			openInFolder: isMac ? t("fileExplorer.openInFinder") : t("fileExplorer.openInExplorer"),
			copyName: t("fileExplorer.copyName"),
			rename: t("fileExplorer.rename"),
			delete: t("fileExplorer.delete"),
		},
		onClose,
		onOpenInFolder,
		onCopyName,
		onRename,
		onDelete: handleDelete,
	};
}
