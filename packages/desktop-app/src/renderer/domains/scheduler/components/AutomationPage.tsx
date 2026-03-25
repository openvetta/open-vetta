import { useEffect, useState } from "react";
import { useAtomValue, useAtom } from "jotai";
import { scheduledTasksAtom, selectedTaskIdAtom, formOpenAtom, projectsAtom } from "@shared/store/atoms";
import type { ScheduledTask } from "@shared/store/atoms";
import { useScheduledTasks } from "../hooks/useScheduledTasks";
import { TaskList } from "./TaskList";
import { ExecutionHistory } from "./ExecutionHistory";
import { TaskFormDialog } from "./TaskForm";

export function AutomationPage(): JSX.Element {
	const tasks = useAtomValue(scheduledTasksAtom);
	const projects = useAtomValue(projectsAtom);
	const [selectedTaskId, setSelectedTaskId] = useAtom(selectedTaskIdAtom);
	const [formEditingTask, setFormEditingTask] = useAtom(formOpenAtom);
	const { refreshTasks } = useScheduledTasks();
	const selectedTask = tasks.find((t) => t.id === selectedTaskId);

	const [dialogOpen, setDialogOpen] = useState(false);

	useEffect(() => {
		refreshTasks();
	}, [refreshTasks]);

	useEffect(() => {
		if (formEditingTask !== undefined) {
			setDialogOpen(true);
		}
	}, [formEditingTask]);

	const handleCloseDialog = () => {
		setDialogOpen(false);
		setFormEditingTask(undefined);
	};

	const handleNewTask = () => {
		setFormEditingTask(null);
		setDialogOpen(true);
	};

	const handleEditTask = (task: ScheduledTask) => {
		setFormEditingTask(task);
		setDialogOpen(true);
	};

	const noProjects = projects.length === 0;

	return (
		<div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
			{/* ─── Header ─── */}
			<div className="flex items-center justify-between px-6 pt-5 pb-1">
				<h1 className="text-lg font-semibold tracking-tight text-foreground">
					自动化
				</h1>
				<button
					type="button"
					onClick={handleNewTask}
					disabled={noProjects}
					title={noProjects ? "请先在侧边栏添加项目" : "新建定时任务"}
					className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-all duration-200 hover:bg-primary/80 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-30"
				>
					<span className="icon-[mdi--plus] text-[15px]" />
					新建任务
				</button>
			</div>

			{/* ─── Content ─── */}
			<div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 pt-4 pb-6">
				{tasks.length === 0 ? (
					<EmptyState onNew={noProjects ? undefined : handleNewTask} noProjects={noProjects} />
				) : (
					<>
						<TaskList
							selectedTaskId={selectedTaskId}
							onSelectTask={(id) => setSelectedTaskId(selectedTaskId === id ? null : id)}
							onEditTask={handleEditTask}
						/>
						{selectedTask && (
							<div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
								<ExecutionHistory taskId={selectedTask.id} />
							</div>
						)}
					</>
				)}
			</div>

			<TaskFormDialog
				open={dialogOpen}
				task={formEditingTask ?? undefined}
				onClose={handleCloseDialog}
			/>
		</div>
	);
}

function EmptyState({ onNew, noProjects }: { onNew?: () => void; noProjects: boolean }): JSX.Element {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
			<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
				<span className="icon-[mdi--clock-check-outline] text-3xl text-muted-foreground/50" />
			</div>
			<div className="space-y-1">
				<p className="text-sm font-medium text-muted-foreground">
					{noProjects ? "请先添加项目" : "暂无定时任务"}
				</p>
				<p className="text-xs text-muted-foreground/50">
					{noProjects
						? "在侧边栏中添加项目后即可创建自动化任务"
						: "创建定时任务，让 AI 按计划自动执行"}
				</p>
			</div>
			{onNew && (
				<button
					type="button"
					onClick={onNew}
					className="mt-1 flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-sm text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-[0.97]"
				>
					<span className="icon-[mdi--plus] text-[15px]" />
					创建第一个任务
				</button>
			)}
		</div>
	);
}
