import { useEffect, useState } from "react";
import { useAtomValue, useAtom } from "jotai";
import {
	batchProjectsAtom,
	selectedBatchTaskIdAtom,
	batchProjectDialogOpenAtom,
	type BatchProject,
} from "@shared/store/atoms";
import { useBatchTasks } from "../hooks/useBatchTasks";
import { BatchTaskList } from "./BatchTaskList";
import { BatchTaskDetail } from "./BatchTaskDetail";
import { BatchProjectDialog } from "./BatchProjectDialog";
import { Button } from "@shared/components/ui/button";

export function BatchTasksPage(): JSX.Element {
	const projects = useAtomValue(batchProjectsAtom);
	const [selectedTaskId, setSelectedTaskId] = useAtom(selectedBatchTaskIdAtom);
	const [dialogProject, setDialogProject] = useAtom(batchProjectDialogOpenAtom);
	const { refreshProjects } = useBatchTasks();

	const selectedTask = projects
		.flatMap((p) => p.tasks)
		.find((t) => t.id === selectedTaskId);

	const [dialogOpen, setDialogOpen] = useState(false);

	useEffect(() => {
		refreshProjects();
	}, [refreshProjects]);

	useEffect(() => {
		if (dialogProject !== undefined) {
			setDialogOpen(true);
		}
	}, [dialogProject]);

	const handleCloseDialog = () => {
		setDialogOpen(false);
		setDialogProject(undefined);
	};

	const handleNewProject = () => {
		setDialogProject(null);
		setDialogOpen(true);
	};

	return (
		<div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
			<div className="flex items-center justify-between px-6 pt-5 pb-1">
				<h1 className="text-lg font-semibold tracking-tight text-foreground">
					批量任务
				</h1>
				<Button onClick={handleNewProject} className="rounded-full px-4">
					<span className="icon-[mdi--plus] mr-1.5 text-[15px]" />
					新建项目
				</Button>
			</div>

			<div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 pt-4 pb-6">
				{projects.length === 0 ? (
					<EmptyState onNew={handleNewProject} />
				) : (
					<>
						<BatchTaskList
							projects={projects}
							selectedTaskId={selectedTaskId}
							onSelectTask={(id: string | null) => setSelectedTaskId(selectedTaskId === id ? null : id)}
							onEditProject={(project: BatchProject) => {
								setDialogProject(project);
								setDialogOpen(true);
							}}
						/>
						{selectedTask && (
							<div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
								<BatchTaskDetail task={selectedTask} />
							</div>
						)}
					</>
				)}
			</div>

			<BatchProjectDialog
				open={dialogOpen}
				project={dialogProject ?? undefined}
				onClose={handleCloseDialog}
			/>
		</div>
	);
}

function EmptyState({ onNew }: { onNew: () => void }): JSX.Element {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
			<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
				<span className="icon-[mdi--format-list-bulleted] text-3xl text-muted-foreground/50" />
			</div>
			<div className="space-y-1">
				<p className="text-sm font-medium text-muted-foreground">暂无批量任务</p>
				<p className="text-xs text-muted-foreground/50">
					创建批量任务，让 AI 自动处理多个文件夹
				</p>
			</div>
			<Button variant="secondary" onClick={onNew} className="mt-1">
				<span className="icon-[mdi--plus] mr-1.5 text-[15px]" />
				创建第一个项目
			</Button>
		</div>
	);
}
