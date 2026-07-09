import type { ScheduledTask } from "@shared/store/atoms";
import { useTaskFormModel } from "../hooks/useTaskFormModel";
import { TaskFormDialogView } from "./TaskFormDialogView";

interface TaskFormDialogProps {
	open: boolean;
	task?: ScheduledTask;
	onClose: () => void;
}

export function TaskFormDialog({ open, task, onClose }: TaskFormDialogProps): JSX.Element {
	return (
		<TaskFormDialogView
			{...useTaskFormModel({ open, task, onClose })}
			open={open}
			task={task}
			onClose={onClose}
		/>
	);
}
