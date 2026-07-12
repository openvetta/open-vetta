import type { ScheduledTask } from "@shared/store/scheduler-atoms";
import { AutomationPageView as ThemeAutomationPageView } from "@vetta/theme-ui/scheduler";
import { useTranslation } from "react-i18next";
import { HistoryDrawer } from "./HistoryDrawer";
import { TaskFormDialog } from "./TaskForm";
import { TaskList } from "./TaskList";

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
		<ThemeAutomationPageView
			hasTasks={hasTasks}
			onNewTask={onNewTask}
			labels={{
				title: t("page.title"),
				subtitle: t("page.subtitle"),
				newTask: t("page.newTask"),
				newTaskTitle: t("page.newTaskTitle"),
				emptyTitle: t("empty.title"),
				emptyDesc: t("empty.desc"),
				emptyAction: t("empty.action"),
			}}
			taskList={
				<TaskList
					selectedTaskId={selectedTaskId}
					onSelectTask={onSelectTask}
					onEditTask={onEditTask}
				/>
			}
			historyDrawer={
				<HistoryDrawer task={selectedTask} onClose={onCloseHistory} onEdit={onEditTask} />
			}
			taskFormDialog={
				<TaskFormDialog open={dialogOpen} task={editingTask} onClose={onCloseDialog} />
			}
		/>
	);
}
