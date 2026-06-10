import { useEffect, useState } from "react";
import { useAtomValue, useAtom, useSetAtom } from "jotai";
import { motion } from "motion/react";
import { scheduledTasksAtom, selectedTaskIdAtom, formOpenAtom, runningTaskIdsAtom } from "@shared/store/atoms";
import type { ScheduledTask } from "@shared/store/atoms";
import { Button } from "@shared/components/ui/button";
import { useScheduledTasks } from "../hooks/useScheduledTasks";
import { TaskList } from "./TaskList";
import { HistoryDrawer } from "./HistoryDrawer";
import { TaskFormDialog } from "./TaskForm";

const easeOut = [0.22, 1, 0.36, 1] as const;

export function AutomationPage(): JSX.Element {
	const tasks = useAtomValue(scheduledTasksAtom);
	const [selectedTaskId, setSelectedTaskId] = useAtom(selectedTaskIdAtom);
	const [formEditingTask, setFormEditingTask] = useAtom(formOpenAtom);
	const { refreshTasks } = useScheduledTasks();
	const setRunningTaskIds = useSetAtom(runningTaskIdsAtom);
	const selectedTask = tasks.find((t) => t.id === selectedTaskId);

	const [dialogOpen, setDialogOpen] = useState(false);

	useEffect(() => {
		refreshTasks();
	}, [refreshTasks]);

	// 运行态：进入时拉取快照，再订阅事件增量维护。task.started 标记为运行中，
	// 完成/中止/失败时移除，让卡片在「运行中」与「待运行」之间正确切换。
	useEffect(() => {
		void window.vetta.scheduler.getRunningTaskIds().then((ids) => {
			setRunningTaskIds(new Set(ids));
		});
		return window.vetta.scheduler.onTaskEvent((event) => {
			// tasks.changed 不携带 taskId，且与运行集合无关，直接忽略。
			if (event.type === "tasks.changed") return;
			setRunningTaskIds((prev) => {
				const next = new Set(prev);
				if (event.type === "task.started") next.add(event.taskId);
				else next.delete(event.taskId);
				return next;
			});
		});
	}, [setRunningTaskIds]);

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

	return (
		<div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
			{/* Drag region */}
			<div className="drag-region h-12 shrink-0" />

			{/* ─── Header ─── */}
			<div className="relative shrink-0 px-8 pb-4">
				<div className="flex items-end justify-between gap-4">
					<motion.div
						initial={{ opacity: 0, y: -8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, ease: easeOut }}
					>
						<h1 className="bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-[26px] font-bold leading-tight tracking-tight text-transparent">
							自动化
						</h1>
						<p className="mt-1 text-[12px] text-muted-foreground/60">
							让 AI 按计划自动执行任务，解放双手
						</p>
					</motion.div>

					<Button
						type="button"
						variant="primary"
						onClick={handleNewTask}
						title="新建定时任务"
					>
						<span className="icon-[mdi--plus] text-[15px]" />
						新建任务
					</Button>
				</div>
			</div>

			{/* ─── Content ─── */}
			<div className="flex flex-1 flex-col gap-5 overflow-y-auto px-8 pt-5 pb-6">
				{tasks.length === 0 ? (
					<EmptyState onNew={handleNewTask} />
				) : (
					<TaskList
						selectedTaskId={selectedTaskId}
						onSelectTask={(id) => setSelectedTaskId(selectedTaskId === id ? null : id)}
						onEditTask={handleEditTask}
					/>
				)}
			</div>

			{/* Execution history slides in from the right instead of stacking
			    below the grid — keeps history tied to the clicked card even when
			    there are many tasks. */}
			<HistoryDrawer
				task={selectedTask ?? null}
				onClose={() => setSelectedTaskId(null)}
				onEdit={handleEditTask}
			/>

			<TaskFormDialog
				open={dialogOpen}
				task={formEditingTask ?? undefined}
				onClose={handleCloseDialog}
			/>
		</div>
	);
}

function EmptyState({ onNew }: { onNew: () => void }): JSX.Element {
	return (
		<motion.div
			className="flex flex-1 flex-col items-center justify-center gap-5 text-center"
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, ease: easeOut }}
		>
			<motion.div
				className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-inset ring-primary/20"
				animate={{ y: [0, -6, 0] }}
				transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
			>
				<span className="absolute inset-0 rounded-3xl bg-primary/10 blur-2xl" />
				<span className="icon-[mdi--clock-check-outline] relative text-4xl text-primary/80" />
			</motion.div>
			<div className="space-y-1.5">
				<p className="text-[15px] font-semibold text-foreground">
					暂无定时任务
				</p>
				<p className="max-w-xs text-[12px] text-muted-foreground/60">
					创建定时任务，让 AI 按计划自动执行
				</p>
			</div>
			<Button type="button" variant="primary" onClick={onNew} className="mt-2">
				<span className="icon-[mdi--plus] text-[15px]" />
				创建第一个任务
			</Button>
		</motion.div>
	);
}
