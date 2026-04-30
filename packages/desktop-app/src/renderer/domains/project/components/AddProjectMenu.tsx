import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { NewProjectDialog } from "@shared/components/NewProjectDialog";
import { useProjects } from "../hooks/useProjects";
import { cn } from "@shared/lib/utils";

interface AddProjectMenuProps {
	className?: string;
	variant?: "icon" | "navItem";
}

export function AddProjectMenu({ className, variant = "icon" }: AddProjectMenuProps): JSX.Element {
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
				{variant === "navItem" ? (
					<button
						type="button"
						title="新建项目"
						onClick={() => setShowAddMenu((v) => !v)}
						className={cn(
							"no-drag flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
							showAddMenu
								? "bg-accent text-foreground"
								: "text-foreground hover:bg-accent",
						)}
					>
						<span className="icon-[mdi--plus-circle-outline] h-4 w-4 shrink-0" />
						新建项目
					</button>
				) : (
					<button
						type="button"
						title="新建项目"
						onClick={() => setShowAddMenu((v) => !v)}
						className="flex items-center justify-center rounded-md p-1.5 transition-colors text-foreground opacity-60 hover:bg-accent hover:opacity-100"
					>
						<span className="icon-[mdi--plus] h-4 w-4" />
					</button>
				)}
				<AnimatePresence>
					{showAddMenu && (
						<motion.div
							initial={{ opacity: 0, scale: 0.95, y: -4 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.95, y: -4 }}
							transition={{ duration: 0.12 }}
							className={cn(
								"absolute z-50 mt-1 w-[150px] overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-xl",
								variant === "navItem" ? "left-0 top-full" : "right-0 top-full",
							)}
						>
							<button
								type="button"
								onClick={() => {
									setShowAddMenu(false);
									setShowNewProject(true);
								}}
								className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-accent/50"
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
								className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-accent/50"
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
