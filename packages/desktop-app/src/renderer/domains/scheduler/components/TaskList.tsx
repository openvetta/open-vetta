import type { ScheduledTask } from "@shared/store/atoms";
import { useTaskListModel } from "../hooks/useTaskListModel";
import { TaskListView } from "./TaskListView";

interface TaskListProps {
	selectedTaskId: string | null;
	onSelectTask: (id: string) => void;
	onEditTask: (task: ScheduledTask) => void;
}

export function TaskList({ selectedTaskId, onSelectTask, onEditTask }: TaskListProps): JSX.Element {
	return <TaskListView {...useTaskListModel({ selectedTaskId })} onSelectTask={onSelectTask} onEditTask={onEditTask} />;
}
