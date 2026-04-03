import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Project } from "@shared/store/atoms";

const isMac = navigator.platform.toUpperCase().includes("MAC");

interface ProjectContextMenuProps {
	x: number;
	y: number;
	project: Project;
	onClose: () => void;
	onArchive: (cwd: string) => void;
	onRemove: (cwd: string) => void;
	onDelete: (cwd: string) => void;
}

export function ProjectContextMenu({ x, y, project, onClose, onArchive, onRemove, onDelete }: ProjectContextMenuProps): JSX.Element {
	const menuRef = useRef<HTMLDivElement>(null);
	const [adjustedPos, setAdjustedPos] = useState({ x, y });

	useLayoutEffect(() => {
		const el = menuRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		setAdjustedPos({
			x: x + rect.width > vw ? vw - rect.width - 4 : x,
			y: y + rect.height > vh ? vh - rect.height - 4 : y,
		});
	}, [x, y]);

	useEffect(() => {
		function handleClick(e: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [onClose]);

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
				className="fixed z-50 w-[160px] overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-xl"
				style={{
					left: `${adjustedPos.x}px`,
					top: `${adjustedPos.y}px`,
				}}
			>
				<button
					type="button"
					onClick={() => {
						void window.vetta.shell.showInFolder(project.cwd);
						onClose();
					}}
					className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
				>
					<span className="icon-[mdi--folder-open-outline] h-3.5 w-3.5" />
					{isMac ? "在访达中打开" : "从此电脑打开"}
				</button>
				<button
					type="button"
					onClick={() => {
						onArchive(project.cwd);
						onClose();
					}}
					className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
				>
					<span className="icon-[mdi--archive-outline] h-3.5 w-3.5" />
					归档项目
				</button>
				<button
					type="button"
					onClick={() => {
						onRemove(project.cwd);
						onClose();
					}}
					className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
				>
					<span className="icon-[mdi--playlist-remove] h-3.5 w-3.5" />
					从列表中移除
				</button>
				<div className="mx-1.5 my-1 h-px bg-border" />
				<button
					type="button"
					onClick={() => {
						onDelete(project.cwd);
						onClose();
					}}
					className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-destructive transition-colors hover:bg-accent"
				>
					<span className="icon-[mdi--delete-outline] h-3.5 w-3.5" />
					删除项目
				</button>
			</motion.div>
		</AnimatePresence>
	);
}
