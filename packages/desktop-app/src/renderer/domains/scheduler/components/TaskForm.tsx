import { useScheduledTasks } from "../hooks/useScheduledTasks";
import { Button } from "@shared/components/ui/button";
import {
	Dialog,
	DialogContent,
} from "@shared/components/ui/dialog";
import { defaultConversationCwdAtom, projectsAtom } from "@shared/store/atoms";
import type { ExecutionModeOverride, ScheduledTask } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import {
	SchedulerTaskFields,
	type SchedulerTaskDraft,
} from "./SchedulerTaskFields";
import {
	getDefaultDailySchedule,
	toCronExpression,
} from "./schedule-picker/cron-utils";

interface TaskFormDialogProps {
	open: boolean;
	task?: ScheduledTask;
	onClose: () => void;
}

export function TaskFormDialog({ open, task, onClose }: TaskFormDialogProps): JSX.Element {
	const { createTask, updateTask } = useScheduledTasks();
	const projects = useAtomValue(projectsAtom);
	const defaultCwd = useAtomValue(defaultConversationCwdAtom);
	const [data, setData] = useState<SchedulerTaskDraft>({
		executionMode: "full-access",
	});

	useEffect(() => {
		if (!open) return;
		const defaultCron = toCronExpression(getDefaultDailySchedule());
		setData({
			name: task?.name ?? "",
			cwd: task?.cwd ?? defaultCwd ?? projects[0]?.cwd ?? "",
			prompt: task?.prompt ?? "",
			cron: task?.cron ?? defaultCron,
			isOnce: task?.isOnce ?? false,
			enabled: task?.enabled ?? true,
			executionMode: task?.executionMode ?? "full-access",
			modelKey: task?.modelKey,
			skill: task?.skill ?? null,
		});
	}, [defaultCwd, open, projects, task]);

	const canSubmit = Boolean(data.name?.trim() && data.prompt?.trim() && data.cwd && data.cron);

	const handleSubmit = async () => {
		if (!canSubmit || !data.name || !data.prompt || !data.cwd || !data.cron) return;
		const taskData = {
			name: data.name,
			prompt: data.prompt,
			cron: data.cron,
			isOnce: data.isOnce ?? false,
			enabled: true,
			cwd: data.cwd,
			executionMode: (data.executionMode ?? "full-access") as ExecutionModeOverride,
			modelKey: data.modelKey ?? undefined,
			skill: data.skill ?? undefined,
		};

		if (task) {
			await updateTask(task.id, taskData);
		} else {
			await createTask(taskData);
		}
		onClose();
	};

	return (
		<Dialog open={open} onOpenChange={(value) => !value && onClose()}>
			<DialogContent
				className="flex max-h-[82vh] flex-col gap-0 overflow-hidden rounded-xl border border-border/60 bg-card/95 p-0 backdrop-blur-md sm:max-w-3xl"
				showCloseButton={false}
			>
				<div className="flex-1 overflow-y-auto px-7 py-6">
					<SchedulerTaskFields
						value={data}
						onChange={setData}
						namePlaceholder={task ? "任务名称" : "新建任务"}
						showWorkDirSelector={false}
					/>
				</div>

				<div className="flex items-center justify-end gap-2 border-t border-border/40 px-5 py-3">
					<Button
						type="button"
						variant="ghost"
						onClick={onClose}
						className="h-9 rounded-lg px-3 text-[13px] text-muted-foreground hover:text-foreground"
					>
						<span className="icon-[mdi--close] h-4 w-4" />
						<span>取消</span>
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={!canSubmit}
						className="h-9 rounded-lg bg-primary px-4 text-[13px] text-primary-foreground hover:bg-primary/90"
					>
						<span className="icon-[mdi--check] h-4 w-4" />
						<span>{task ? "保存" : "创建"}</span>
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
