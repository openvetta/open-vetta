import { useEffect, useRef } from "react";
import { useSetAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { renamingPathAtom, type FsEntry } from "@shared/store/atoms";

interface FileContextMenuProps {
	x: number;
	y: number;
	entry: FsEntry;
	onClose: () => void;
	onDelete: (entry: FsEntry) => void;
}

export function FileContextMenu({ x, y, entry, onClose, onDelete }: FileContextMenuProps): JSX.Element {
	const menuRef = useRef<HTMLDivElement>(null);
	const setRenamingPath = useSetAtom(renamingPathAtom);

	// Close on outside click
	useEffect(() => {
		function handleClick(e: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [onClose]);

	// Close on Escape
	useEffect(() => {
		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [onClose]);

	return (
		<AnimatePresence>
			<motion.div
				ref={menuRef}
				initial={{ opacity: 0, scale: 0.95 }}
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.95 }}
				transition={{ duration: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
				className="fixed z-50 w-[140px] overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-xl"
				style={{
					left: `${x}px`,
					top: `${y}px`,
				}}
			>
				<button
					type="button"
					onClick={() => {
						setRenamingPath(entry.path);
						onClose();
					}}
					className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
				>
					<span className="icon-[mdi--pencil-outline] h-3.5 w-3.5" />
					重命名
				</button>
				<button
					type="button"
					onClick={() => onDelete(entry)}
					className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-destructive transition-colors hover:bg-accent"
				>
					<span className="icon-[mdi--delete-outline] h-3.5 w-3.5" />
					删除
				</button>
			</motion.div>
		</AnimatePresence>
	);
}
