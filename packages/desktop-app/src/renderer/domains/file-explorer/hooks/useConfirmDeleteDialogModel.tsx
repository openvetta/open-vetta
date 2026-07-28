import { Button } from "@shared/components/ui/button";
import type { FsEntry } from "@shared/store/atoms";
import type { ConfirmDeleteDialogViewProps } from "@vetta/theme-ui/file-explorer";
import { useTranslation } from "react-i18next";

export function useConfirmDeleteDialogModel(
	entry: FsEntry,
	onConfirm: () => void,
	onCancel: () => void,
): ConfirmDeleteDialogViewProps {
	const { t } = useTranslation("chat");

	return {
		labels: {
			title: t("fileExplorer.confirmDeleteTitle"),
			description: (
				<>
					{t("fileExplorer.confirmDeletePrefix", {
						type: entry.isDirectory
							? t("fileExplorer.confirmDeleteFolder")
							: t("fileExplorer.confirmDeleteFile"),
					})}{" "}
					<span className="font-medium text-foreground">{entry.name}</span>{" "}
					{t("fileExplorer.confirmDeleteSuffix", {
						folderNote: entry.isDirectory ? t("fileExplorer.confirmDeleteFolderNote") : "",
					})}
				</>
			),
		},
		onCancel,
		cancelButton: (
			<Button variant="ghost" size="sm" onClick={onCancel}>
				{t("fileExplorer.cancel")}
			</Button>
		),
		confirmButton: (
			<Button variant="destructive" size="sm" onClick={onConfirm}>
				{t("fileExplorer.delete")}
			</Button>
		),
	};
}
