import { type ScheduledTask, scheduledTasksAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "../components/ui/drawer";
import {
	SchedulerApprovalFields,
	type SchedulerEditableData,
	toSchedulerApprovalJsonData,
} from "./SchedulerApprovalFields";
import { useActionApproval, type ActiveActionApproval } from "./useActionApproval";
import { useApprovalCountdown } from "./useApprovalCountdown";

interface UpdateTaskData extends SchedulerEditableData {
	skill?: { name: string; alias?: string; type: "skill" | "scene" } | null;
}

interface UpdateTaskInput {
	operation: "update";
	taskId: string;
	data: UpdateTaskData;
	approvalUi?: string;
}

export function SchedulerUpdateApproval(): JSX.Element | null {
	const approval = useActionApproval("scheduler.update");
	const tasks = useAtomValue(scheduledTasksAtom);
	if (!approval) return null;
	const input = approval.request.input as unknown as UpdateTaskInput;
	const cachedTask = tasks.find((candidate) => candidate.id === input.taskId);

	return (
		<SchedulerUpdateLoader
			key={approval.request.approvalId}
			approval={approval}
			input={input}
			cachedTask={cachedTask}
		/>
	);
}

function SchedulerUpdateLoader({
	approval,
	input,
	cachedTask,
}: {
	approval: ActiveActionApproval;
	input: UpdateTaskInput;
	cachedTask: ScheduledTask | undefined;
}): JSX.Element {
	const [task, setTask] = useState<ScheduledTask | undefined>(cachedTask);
	const [loading, setLoading] = useState(!cachedTask);
	const [loadError, setLoadError] = useState<string | null>(null);
	const countdown = useApprovalCountdown(approval.request.approvalId);

	useEffect(() => {
		console.info("[action-approval:scheduler.update] request", {
			approvalId: approval.request.approvalId,
			input,
			cachedTaskCount: cachedTask ? 1 : 0,
			cachedTask,
		});
	}, [approval.request.approvalId, cachedTask, input]);

	useEffect(() => {
		if (cachedTask) {
			console.info("[action-approval:scheduler.update] source", {
				approvalId: approval.request.approvalId,
				source: "atom",
				task: cachedTask,
			});
			return;
		}
		let cancelled = false;
		void window.vetta.scheduler
			.getTasks()
			.then((tasks) => {
				if (cancelled) return;
				const currentTask = tasks.find((candidate) => candidate.id === input.taskId);
				console.info("[action-approval:scheduler.update] query", {
					approvalId: approval.request.approvalId,
					requestedTaskId: input.taskId,
					returnedTaskIds: tasks.map((candidate) => candidate.id),
					matchedTask: currentTask,
				});
				setTask(currentTask);
				if (!currentTask) setLoadError("未找到当前定时任务，无法加载完整配置。");
			})
			.catch((error: unknown) => {
				console.error("[action-approval:scheduler.update] query-failed", {
					approvalId: approval.request.approvalId,
					requestedTaskId: input.taskId,
					error,
				});
				if (!cancelled) setLoadError("加载当前定时任务配置失败。");
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [approval.request.approvalId, cachedTask, input.taskId]);

	const initialData = useMemo<UpdateTaskData | null>(() => {
		if (!task) return null;
		return {
			name: task.name,
			prompt: task.prompt,
			cron: task.cron,
			isOnce: task.isOnce,
			enabled: task.enabled,
			cwd: task.cwd,
			modelKey: task.modelKey,
			executionMode: task.executionMode,
			skill: task.skill,
			...input.data,
		};
	}, [input.data, task]);

	useEffect(() => {
		if (!initialData) return;
		console.info("[action-approval:scheduler.update] merged", {
			approvalId: approval.request.approvalId,
			currentTask: task,
			agentPatch: input.data,
			mergedData: initialData,
		});
	}, [approval.request.approvalId, initialData, input.data, task]);

	if (loading) {
		return (
			<Drawer open direction="right" dismissible={false}>
				<DrawerContent className="w-[min(520px,calc(100vw-2rem))] sm:max-w-[520px]">
					<DrawerHeader className="border-b border-border/60">
						<DrawerTitle>编辑定时任务变更</DrawerTitle>
						<DrawerDescription>{approval.request.summary}</DrawerDescription>
					</DrawerHeader>
					<div className="min-h-0 flex-1 overflow-y-auto p-4">
						<div className="py-10 text-center text-[12px] text-muted-foreground">正在加载当前任务配置...</div>
					</div>
					<DrawerFooter className="border-t border-border/60">
						<Button variant="outline" size="sm" disabled={approval.responding} onClick={approval.reject}>
							拒绝（{countdown}）
						</Button>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		);
	}

	if (!task || !initialData) {
		return (
			<Drawer open direction="right" dismissible={false}>
				<DrawerContent className="w-[min(520px,calc(100vw-2rem))] sm:max-w-[520px]">
					<DrawerHeader className="border-b border-border/60">
						<DrawerTitle>编辑定时任务变更</DrawerTitle>
						<DrawerDescription>{approval.request.summary}</DrawerDescription>
					</DrawerHeader>
					<div className="min-h-0 flex-1 overflow-y-auto p-4">
						<div className="py-10 text-center text-[12px] text-destructive">{loadError}</div>
					</div>
					<DrawerFooter className="border-t border-border/60">
						<Button variant="outline" size="sm" disabled={approval.responding} onClick={approval.reject}>
							拒绝（{countdown}）
						</Button>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<SchedulerUpdateDrawer
			approval={approval}
			input={input}
			initialData={initialData}
		/>
	);
}

function SchedulerUpdateDrawer({
	approval,
	input,
	initialData,
}: {
	approval: ActiveActionApproval;
	input: UpdateTaskInput;
	initialData: UpdateTaskData;
}): JSX.Element {
	const { request, responding, error, approve, reject } = approval;
	const [data, setData] = useState<SchedulerEditableData>(initialData);
	const countdown = useApprovalCountdown(approval.request.approvalId);

	return (
		<Drawer open direction="right" dismissible={false}>
			<DrawerContent className="w-[min(520px,calc(100vw-2rem))] sm:max-w-[520px]">
				<DrawerHeader className="border-b border-border/60">
					<DrawerTitle>编辑定时任务变更</DrawerTitle>
					<DrawerDescription>{request.summary}</DrawerDescription>
				</DrawerHeader>
				<div className="min-h-0 flex-1 overflow-y-auto p-4">
					<div className="mb-4 rounded-lg border border-border/50 bg-card/40 p-3">
						<div className="text-[11px] text-muted-foreground">任务 ID</div>
						<div className="mt-1 break-all font-mono text-[11px] text-foreground">{input.taskId}</div>
					</div>
					<SchedulerApprovalFields value={data} onChange={setData} />
					<div className="mt-4 text-[11px] text-muted-foreground">权限：{request.permission}</div>
					{error && <div className="mt-2 text-[11px] text-destructive">{error}</div>}
				</div>
				<DrawerFooter className="border-t border-border/60">
					<Button variant="outline" size="sm" disabled={responding} onClick={reject}>
						拒绝（{countdown}）
					</Button>
					<Button
						size="sm"
						disabled={responding}
						onClick={() => {
							const approvedInput = {
								operation: "update",
								taskId: input.taskId,
								data: toSchedulerApprovalJsonData({ ...initialData, ...data }),
								approvalUi: input.approvalUi ?? "scheduler.update",
							} as const;
							console.info("[action-approval:scheduler.update] submit", {
								approvalId: request.approvalId,
								input: approvedInput,
							});
							approve(approvedInput);
						}}
					>
						{responding ? "更新中..." : "确认更新"}
					</Button>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
