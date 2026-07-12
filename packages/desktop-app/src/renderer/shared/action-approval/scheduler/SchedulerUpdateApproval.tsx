import { type ScheduledTask, scheduledTasksAtom } from "@shared/store/atoms";
import { useThemeComponent } from "@vetta/theme-sdk";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	type SchedulerEditableData,
	toSchedulerApprovalJsonData,
} from "./SchedulerApprovalFields";
import { SchedulerEditApprovalDrawerView } from "./SchedulerEditApprovalDrawerView";
import { useActionApproval, type ActiveActionApproval } from "../useActionApproval";

interface UpdateTaskData extends SchedulerEditableData {
	skill?: { name: string; alias?: string; type: "skill" | "scene" } | null;
}

interface UpdateTaskInput {
	operation: "update";
	taskId: string;
	data: UpdateTaskData;
	approvalUi?: string;
}

function useSchedulerUpdateApprovalModel() {
	return true;
}

export function SchedulerUpdateApproval(): JSX.Element | null {
	const _model = useSchedulerUpdateApprovalModel();
	void _model;
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
	const { t } = useTranslation("common");
	const ThemedSchedulerEditApprovalDrawerView = useThemeComponent(
		"root.approval.schedulerEditView",
		SchedulerEditApprovalDrawerView,
	);

	useEffect(() => {
		console.info(`[action-approval:scheduler.update] request ${JSON.stringify({
			approvalId: approval.request.approvalId,
			input,
			cachedTaskCount: cachedTask ? 1 : 0,
			cachedTask,
		})}`);
	}, [approval.request.approvalId, cachedTask, input]);

	useEffect(() => {
		if (cachedTask) {
			console.info(`[action-approval:scheduler.update] source ${JSON.stringify({
				approvalId: approval.request.approvalId,
				source: "atom",
				task: cachedTask,
			})}`);
			return;
		}
		let cancelled = false;
		void window.vetta.scheduler
			.getTasks()
			.then((tasks) => {
				if (cancelled) return;
				const currentTask = tasks.find((candidate) => candidate.id === input.taskId);
				console.info(`[action-approval:scheduler.update] query ${JSON.stringify({
					approvalId: approval.request.approvalId,
					requestedTaskId: input.taskId,
					returnedTaskIds: tasks.map((candidate) => candidate.id),
					matchedTask: currentTask,
				})}`);
				setTask(currentTask);
				if (!currentTask) setLoadError(t("schedulerApproval.updateNotFound"));
			})
			.catch((error: unknown) => {
				console.error(`[action-approval:scheduler.update] query-failed ${JSON.stringify({
					approvalId: approval.request.approvalId,
					requestedTaskId: input.taskId,
					error,
				})}`);
				if (!cancelled) setLoadError(t("schedulerApproval.updateLoadFailed"));
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
		console.info(`[action-approval:scheduler.update] merged ${JSON.stringify({
			approvalId: approval.request.approvalId,
			currentTask: task,
			agentPatch: input.data,
			mergedData: initialData,
		})}`);
	}, [approval.request.approvalId, initialData, input.data, task]);

	if (loading) {
		return (
			<ThemedSchedulerEditApprovalDrawerView
				title={t("schedulerApproval.updateTitle")}
				description={approval.request.summary}
				loadingMessage={t("schedulerApproval.loadingCurrentTask")}
				responding={approval.responding}
				countdown={approval.countdown.formatted}
				labels={{
					reject: t("actionApproval.reject"),
					submit: t("schedulerApproval.confirmUpdate"),
					submitting: t("schedulerApproval.updating"),
					taskId: t("schedulerApproval.taskId"),
					permission: t("actionApproval.permission", { permission: approval.request.permission }),
				}}
				onReject={approval.reject}
			/>
		);
	}

	if (!task || !initialData) {
		return (
			<ThemedSchedulerEditApprovalDrawerView
				title={t("schedulerApproval.updateTitle")}
				description={approval.request.summary}
				loadError={loadError}
				responding={approval.responding}
				countdown={approval.countdown.formatted}
				labels={{
					reject: t("actionApproval.reject"),
					submit: t("schedulerApproval.confirmUpdate"),
					submitting: t("schedulerApproval.updating"),
					taskId: t("schedulerApproval.taskId"),
					permission: t("actionApproval.permission", { permission: approval.request.permission }),
				}}
				onReject={approval.reject}
			/>
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
	const { t } = useTranslation("common");
	const { request, responding, error, approve, reject } = approval;
	const [data, setData] = useState<SchedulerEditableData>(initialData);
	const ThemedSchedulerEditApprovalDrawerView = useThemeComponent(
		"root.approval.schedulerEditView",
		SchedulerEditApprovalDrawerView,
	);

	return (
		<ThemedSchedulerEditApprovalDrawerView
			title={t("schedulerApproval.updateTitle")}
			description={request.summary}
			value={data}
			taskId={input.taskId}
			error={error}
			responding={responding}
			countdown={approval.countdown.formatted}
			labels={{
				reject: t("actionApproval.reject"),
				submit: t("schedulerApproval.confirmUpdate"),
				submitting: t("schedulerApproval.updating"),
				taskId: t("schedulerApproval.taskId"),
				permission: t("actionApproval.permission", { permission: request.permission }),
			}}
			onChange={setData}
			onReject={reject}
			onSubmit={() => {
				const approvedInput = {
					operation: "update",
					taskId: input.taskId,
					data: toSchedulerApprovalJsonData({ ...initialData, ...data }),
					approvalUi: input.approvalUi ?? "scheduler.update",
				} as const;
				console.info(`[action-approval:scheduler.update] submit ${JSON.stringify({
					approvalId: request.approvalId,
					input: approvedInput,
				})}`);
				approve(approvedInput);
			}}
		/>
	);
}
