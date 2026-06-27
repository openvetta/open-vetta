import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
	const { t } = useTranslation("project");
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
				title: t("importDialog.failedTitle"),
				message: result.error.message,
				confirmLabel: t("importDialog.failedConfirm"),
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
			const more =
				missing.length > 8 ? t("importDialog.partialMore", { count: missing.length - 8 }) : "";
			const list = missing.slice(0, 8).join("\n") + more;
			setConfirm({
				title: t("importDialog.partialTitle"),
				message: t("importDialog.partialMessage", {
					name: result.name,
					count: missing.length,
					list,
				}),
				confirmLabel: t("importDialog.viewProject"),
				cancelLabel: t("importDialog.gotIt"),
				variant: "default",
				onConfirm: onJump,
			});
		} else {
			setConfirm({
				title: t("importDialog.doneTitle"),
				message: t("importDialog.doneMessage", { name: result.name }),
				confirmLabel: t("importDialog.viewProject"),
				cancelLabel: t("importDialog.gotIt"),
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
						title={t("actions.newProject")}
						onClick={() => setShowAddMenu((v) => !v)}
						className={cn(
							"no-drag flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
							showAddMenu
								? "bg-accent text-foreground"
								: "text-foreground hover:bg-accent",
						)}
					>
						<span className="icon-[solar--add-circle-linear] h-4 w-4 shrink-0" />
						{t("actions.newProject")}
					</button>
				) : (
					<button
						type="button"
						title={t("actions.newProject")}
						onClick={() => setShowAddMenu((v) => !v)}
						className={cn(
							"flex items-center justify-center rounded-md p-1.5 text-foreground transition-opacity hover:bg-accent",
							showAddMenu
								? "opacity-100"
								: "opacity-0 group-hover:opacity-60 group-hover:hover:opacity-100",
						)}
					>
						<span className="icon-[solar--add-square-outline] h-4 w-4" />
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
								<span className="icon-[solar--add-folder-linear] h-3.5 w-3.5 shrink-0" />
								{t("actions.newProject")}
							</button>
							<button
								type="button"
								onClick={() => {
									setShowAddMenu(false);
									void openProject();
								}}
								className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-accent/50"
							>
								<span className="icon-[solar--folder-open-linear] h-3.5 w-3.5 shrink-0" />
								{t("actions.openProject")}
							</button>
							<button
								type="button"
								onClick={() => {
									void handleImport();
								}}
								className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-accent/50"
							>
								<span className="icon-[solar--import-linear] h-3.5 w-3.5 shrink-0" />
								{t("actions.importProject")}
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
