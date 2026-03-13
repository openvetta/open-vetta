import { useState, useRef, useEffect } from "react";
import { useAtom } from "jotai";
import { cn } from "../../../lib/utils";
import {
	type FsEntry,
	fileContextMenuAtom,
	renamingPathAtom,
	selectedFilePathAtom,
} from "../../../store/atoms";
import { getFileIcon } from "./fileIcons";

interface FileTreeNodeProps {
	entry: FsEntry;
	depth: number;
	isExpanded: boolean;
	isLoading: boolean;
	onToggleDir: (path: string) => void;
	onRename: (oldPath: string, newName: string) => Promise<void>;
}

const DRAG_MIME = "application/vetta-path";

export function FileTreeNode({
	entry,
	depth,
	isExpanded,
	isLoading,
	onToggleDir,
	onRename,
}: FileTreeNodeProps): JSX.Element {
	const [selectedPath, setSelectedPath] = useAtom(selectedFilePathAtom);
	const [, setContextMenu] = useAtom(fileContextMenuAtom);
	const [renamingPath, setRenamingPath] = useAtom(renamingPathAtom);
	const [dragOver, setDragOver] = useState(false);
	const [renameValue, setRenameValue] = useState(entry.name);
	const inputRef = useRef<HTMLInputElement>(null);

	const isRenaming = renamingPath === entry.path;
	const isSelected = selectedPath === entry.path;
	const icon = getFileIcon(entry.name, entry.isDirectory, isExpanded);

	// Focus rename input
	useEffect(() => {
		if (isRenaming && inputRef.current) {
			inputRef.current.focus();
			// Select name without extension
			const dotIdx = entry.name.lastIndexOf(".");
			const end = entry.isDirectory || dotIdx <= 0 ? entry.name.length : dotIdx;
			inputRef.current.setSelectionRange(0, end);
			setRenameValue(entry.name);
		}
	}, [isRenaming, entry.name, entry.isDirectory]);

	function handleClick() {
		if (entry.isDirectory) {
			onToggleDir(entry.path);
		} else {
			setSelectedPath(entry.path);
		}
	}

	function handleContextMenu(e: React.MouseEvent) {
		e.preventDefault();
		setContextMenu({ x: e.clientX, y: e.clientY, entry });
	}

	function handleRenameSubmit() {
		const trimmed = renameValue.trim();
		if (trimmed && trimmed !== entry.name) {
			void onRename(entry.path, trimmed);
		}
		setRenamingPath(null);
	}

	function handleRenameKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Enter") {
			e.preventDefault();
			handleRenameSubmit();
		} else if (e.key === "Escape") {
			setRenamingPath(null);
		}
	}

	// Drag source
	function handleDragStart(e: React.DragEvent) {
		e.dataTransfer.setData(DRAG_MIME, entry.path);
		e.dataTransfer.effectAllowed = "move";
	}

	// Drop target (directories only)
	function handleDragOver(e: React.DragEvent) {
		if (!entry.isDirectory) return;
		const srcPath = e.dataTransfer.types.includes(DRAG_MIME) ? "" : null;
		if (srcPath === null) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		setDragOver(true);
	}

	function handleDragLeave() {
		setDragOver(false);
	}

	function handleDrop(e: React.DragEvent) {
		setDragOver(false);
		if (!entry.isDirectory) return;
		const srcPath = e.dataTransfer.getData(DRAG_MIME);
		if (!srcPath) return;
		e.preventDefault();

		// Guard: can't drop into self or child
		if (srcPath === entry.path || entry.path.startsWith(srcPath + "/")) return;
		// Guard: can't drop into same parent
		const srcParent = srcPath.substring(0, srcPath.lastIndexOf("/"));
		if (srcParent === entry.path) return;

		// Dispatch custom event so FilesPanel can handle the move
		window.dispatchEvent(
			new CustomEvent("vetta:file-move", { detail: { srcPath, destDir: entry.path } }),
		);
	}

	return (
		<div
			role="treeitem"
			tabIndex={0}
			draggable={!isRenaming}
			onClick={handleClick}
			onContextMenu={handleContextMenu}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			onKeyDown={(e) => {
				if (e.key === "Enter") handleClick();
			}}
			className={cn(
				"flex items-center gap-1.5 rounded-md px-1.5 py-[3px] text-[12px] cursor-default select-none transition-colors",
				isSelected && !isRenaming
					? "bg-[var(--hover-strong)] text-[var(--text-1)]"
					: "text-[var(--text-2)] hover:bg-[var(--hover)]",
				dragOver && "ring-1 ring-[var(--accent)] bg-[var(--hover)]",
			)}
			style={{ paddingLeft: `${depth * 16 + 6}px` }}
		>
			{/* Chevron for directories */}
			{entry.isDirectory ? (
				<span
					className={cn(
						"h-3 w-3 shrink-0 transition-transform",
						isLoading
							? "icon-[mdi--loading] animate-spin text-[var(--text-3)]"
							: isExpanded
								? "icon-[mdi--chevron-down]"
								: "icon-[mdi--chevron-right]",
					)}
				/>
			) : (
				<span className="h-3 w-3 shrink-0" />
			)}

			{/* File type icon */}
			<span className={cn(icon, "h-3.5 w-3.5 shrink-0", entry.isDirectory ? "text-[var(--accent)]" : "text-[var(--text-3)]")} />

			{/* Name or rename input */}
			{isRenaming ? (
				<input
					ref={inputRef}
					type="text"
					value={renameValue}
					onChange={(e) => setRenameValue(e.target.value)}
					onBlur={handleRenameSubmit}
					onKeyDown={handleRenameKeyDown}
					className="min-w-0 flex-1 rounded border border-[var(--accent)] bg-[var(--panel-bg)] px-1 py-0 text-[12px] text-[var(--text-1)] outline-none"
					onClick={(e) => e.stopPropagation()}
				/>
			) : (
				<span className="min-w-0 flex-1 truncate">{entry.name}</span>
			)}
		</div>
	);
}
