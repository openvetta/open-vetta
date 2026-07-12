import type { FsEntry } from "@shared/store/atoms";
import { ConfirmDeleteDialogView } from "@vetta/theme-ui/file-explorer";
import { useConfirmDeleteDialogModel } from "../hooks/useConfirmDeleteDialogModel";

interface ConfirmDeleteDialogProps {
	entry: FsEntry;
	onConfirm: () => void;
	onCancel: () => void;
}

export function ConfirmDeleteDialog({ entry, onConfirm, onCancel }: ConfirmDeleteDialogProps): JSX.Element {
	const model = useConfirmDeleteDialogModel(entry, onConfirm, onCancel);
	return <ConfirmDeleteDialogView {...model} />;
}
