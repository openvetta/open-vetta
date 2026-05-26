import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { NewProjectDialog } from "@shared/components/NewProjectDialog";
import { confirmDialogAtom } from "@shared/store/atoms";
import { useBatchTasks } from "@domains/batch-tasks/hooks/useBatchTasks";
import { useProjects } from "../hooks/useProjects";
import { cn } from "@shared/lib/utils";

interface AddProjectMenuProps {
	className?: string;
	variant?: "icon" | "navItem";
}

export function AddProjectMenu({ className, variant = "icon" }: AddProjectMenuProps): JSX.Element {
	const { createProject, openProject, refreshProjects } = useProjects();
	const { refreshProjects: refreshBatchProjects } = useBatchTasks();
	const setConfirm = useSetAtom(confirmDialogAtom);
	const navigate = useNavigate();
	const [showAddMenu, setShowAddMenu] = useState(false);
	const [showNewProject, setShowNewProject] = useState(false);
	const addMenuRef = useRef<HTMLDivElement>(null);

	const handleImport = async () => {
		setShowAddMenu(false);
		const result = await window.vetta.project.import();
		if (!result) return; // user cancelled the open dialog
		if ("error" in result) {
			// Anything that isn't a recognized vetta export ends up here as
			// `unsupported-zip` — surface the user-friendly message exactly as the
			// product spec requires.
			setConfirm({
				title: "导入失败",
				message: result.error.message,
				confirmLabel: "好的",
				variant: "danger",
				onConfirm: () => {},
			});
			return;
		}
		// Refresh both project lists so the new entry shows up in the sidebar.
		await Promise.all([refreshProjects(), refreshBatchProjects()]).catch(() => {});
		const missing = result.missingSources;
		const onJump = () => {
			void navigate({
				to: "/project/$cwd",
				params: { cwd: encodeURIComponent(result.path) },
			});
		};
		if (missing && missing.length > 0) {
			// Batch with stale source paths — let the user see what's missing,
			// then offer to jump to the project page so they can re-link.
			setConfirm({
				title: "导入完成（部分源路径缺失）",
				message: `项目「${result.name}」已导入，但有 ${missing.length} 个 batch 源路径在本机不存在：\n\n${missing.slice(0, 8).join("\n")}${missing.length > 8 ? `\n…还有 ${missing.length - 8} 项` : ""}\n\n这些任务的元数据已保留，进入项目后可手动重链或删除。`,
				confirmLabel: "查看项目",
				cancelLabel: "知道了",
				variant: "default",
				onConfirm: onJump,
			});
		} else {
			setConfirm({
				title: "导入完成",
				message: `项目「${result.name}」已导入到工作区。`,
				confirmLabel: "查看项目",
				cancelLabel: "知道了",
				variant: "default",
				onConfirm: onJump,
			});
		}
	};

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
						<span className="icon-[mdi--create-new-folder-outline] h-4 w-4" />
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
							<button
								type="button"
								onClick={() => {
									void handleImport();
								}}
								className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-accent/50"
							>
								<span className="icon-[mdi--import] h-3.5 w-3.5 shrink-0" />
								导入项目
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
