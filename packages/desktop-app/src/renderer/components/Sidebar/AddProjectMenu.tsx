import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { NewProjectDialog } from "../NewProjectDialog";
import { useProjects } from "../../hooks/useProjects";
import { cn } from "../../lib/utils";

interface AddProjectMenuProps {
	className?: string;
}

export function AddProjectMenu({ className }: AddProjectMenuProps): JSX.Element {
	const { createProject, openProject } = useProjects();
	const [showAddMenu, setShowAddMenu] = useState(false);
	const [showNewProject, setShowNewProject] = useState(false);
	const addMenuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!showAddMenu) return;
		function handleClick(e: MouseEvent) {
			if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
				setShowAddMenu(false);
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [showAddMenu]);

	return (
		<>
			<div className={cn("relative", className)} ref={addMenuRef}>
				<button
					type="button"
					title="新建项目"
					onClick={() => setShowAddMenu((v) => !v)}
					className="flex items-center justify-center rounded-md p-1.5 transition-colors text-[var(--text-1)] opacity-60 hover:bg-[var(--hover-strong)] hover:opacity-100"
				>
					<span className="icon-[mdi--plus] h-4 w-4" />
				</button>
				<AnimatePresence>
					{showAddMenu && (
						<motion.div
							initial={{ opacity: 0, scale: 0.95, y: -4 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.95, y: -4 }}
							transition={{ duration: 0.12 }}
							className="absolute right-0 top-full z-50 mt-1 w-[120px] overflow-hidden rounded-lg border border-[var(--popup-border)] bg-[var(--popup-bg)] py-1"
							style={{ boxShadow: "var(--popup-shadow)" }}
						>
							<button
								type="button"
								onClick={() => {
									setShowAddMenu(false);
									setShowNewProject(true);
								}}
								className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--text-2)] hover:bg-[var(--hover)]"
							>
								<span className="icon-[mdi--folder-plus-outline] h-3.5 w-3.5 shrink-0" />
								新建项目
							</button>
							<button
								type="button"
								onClick={() => {
									setShowAddMenu(false);
									void openProject();
								}}
								className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--text-2)] hover:bg-[var(--hover)]"
							>
								<span className="icon-[mdi--folder-open-outline] h-3.5 w-3.5 shrink-0" />
								打开项目
							</button>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
			{showNewProject && (
				<NewProjectDialog
					onConfirm={(name) => {
						setShowNewProject(false);
						void createProject(name);
					}}
					onCancel={() => setShowNewProject(false)}
				/>
			)}
		</>
	);
}