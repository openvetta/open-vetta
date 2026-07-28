import type { FsEntry } from "@shared/store/atoms";
import { FileContextMenuView } from "@vetta/theme-ui/file-explorer";
import { useFileContextMenuModel } from "../hooks/useFileContextMenuModel";

interface FileContextMenuProps {
	x: number;
	y: number;
	entry: FsEntry;
	onClose: () => void;
	onDelete: (entry: FsEntry) => void;
}

export function FileContextMenu({ x, y, entry, onClose, onDelete }: FileContextMenuProps): JSX.Element {
	const model = useFileContextMenuModel(entry, onClose, onDelete);
	return <FileContextMenuView {...model} x={x} y={y} />;
}
