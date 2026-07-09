import { Button } from "@shared/components/ui/button";
import type { ScheduledTask } from "@shared/store/atoms";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { HistoryDrawer } from "./HistoryDrawer";
import { TaskFormDialog } from "./TaskForm";
import { TaskList } from "./TaskList";

const easeOut = [0.22, 1, 0.36, 1] as const;

export interface AutomationPageViewProps {
	readonly dialogOpen: boolean;
	readonly editingTask: ScheduledTask | undefined;
	readonly hasTasks: boolean;
	readonly selectedTask: ScheduledTask | null;
	readonly selectedTaskId: string | null;
	readonly onCloseDialog: () => void;
	readonly onCloseHistory: () => void;
	readonly onEditTask: (task: ScheduledTask) => void;
	readonly onNewTask: () => void;
	readonly onSelectTask: (id: string) => void;
}

export function AutomationPageView({
	dialogOpen,
	editingTask,
	hasTasks,
	selectedTask,
	selectedTaskId,
	onCloseDialog,
	onCloseHistory,
	onEditTask,
	onNewTask,
	onSelectTask,
}: AutomationPageViewProps): JSX.Element {
	const { t } = useTranslation("automation");

	return (
		<div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
			<div className="drag-region h-6 shrink-0" />

			<div className="relative shrink-0 px-8 pb-4">
				<div className="flex items-end justify-between gap-4">
					<motion.div
						initial={{ opacity: 0, y: -8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, ease: easeOut }}
					>
						<h1 className="bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-[26px] font-bold leading-tight tracking-tight text-transparent">
							{t("page.title")}
						</h1>
						<p className="mt-1 text-[12px] text-muted-foreground/60">
							{t("page.subtitle")}
						</p>
					</motion.div>

					<Button type="button" variant="primary" onClick={onNewTask} title={t("page.newTaskTitle")}>
						<span className="icon-[mdi--plus] text-[15px]" />
						{t("page.newTask")}
					</Button>
				</div>
			</div>

			<div className="flex flex-1 flex-col gap-5 overflow-y-auto px-8 pt-5 pb-6">
				{hasTasks ? (
					<TaskList
						selectedTaskId={selectedTaskId}
						onSelectTask={onSelectTask}
						onEditTask={onEditTask}
					/>
				) : (
					<AutomationEmptyState onNew={onNewTask} />
				)}
			</div>

			<HistoryDrawer task={selectedTask} onClose={onCloseHistory} onEdit={onEditTask} />

			<TaskFormDialog open={dialogOpen} task={editingTask} onClose={onCloseDialog} />
		</div>
	);
}

function AutomationEmptyState({ onNew }: { readonly onNew: () => void }): JSX.Element {
	const { t } = useTranslation("automation");
	return (
		<motion.div
			className="flex flex-1 flex-col items-center justify-center gap-5 text-center"
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, ease: easeOut }}
		>
			<motion.div
				className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-inset ring-primary/20"
				animate={{ y: [0, -6, 0] }}
				transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
			>
				<span className="absolute inset-0 rounded-2xl bg-primary/10 blur-2xl" />
				<span className="icon-[mdi--clock-check-outline] relative text-4xl text-primary/80" />
			</motion.div>
			<div className="space-y-1.5">
				<p className="text-[15px] font-semibold text-foreground">{t("empty.title")}</p>
				<p className="max-w-xs text-[12px] text-muted-foreground/60">{t("empty.desc")}</p>
			</div>
			<Button type="button" variant="primary" onClick={onNew} className="mt-2">
				<span className="icon-[mdi--plus] text-[15px]" />
				{t("empty.action")}
			</Button>
		</motion.div>
	);
}
