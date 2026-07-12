import { Button } from "@shared/components/ui/button";
import {
	revokeWorkflowComplete,
	terminateWorkflow,
	type WorkflowInstance,
} from "@shared/lib/api";
import { authTokenAtom, authUserAtom, workflowInstanceAtom } from "@shared/store/atoms";
import type { WorkflowProgressViewProps, WorkflowStageViewItem } from "@vetta/theme-ui/flowing";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useState } from "react";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
	pending: { bg: "bg-zinc-500/20", text: "text-zinc-400", label: "待处理" },
	in_progress: { bg: "bg-blue-500/20", text: "text-blue-400", label: "进行中" },
	completed: { bg: "bg-emerald-500/20", text: "text-emerald-400", label: "已完成" },
	returned: { bg: "bg-red-500/20", text: "text-red-400", label: "已退回" },
};

const WORKFLOW_STATUS_LABEL: Record<string, string> = {
	active: "进行中",
	completed: "已完成",
	terminated: "已终止",
};

function getStatusStyle(status: string) {
	return STATUS_STYLES[status] ?? STATUS_STYLES.pending!;
}

export function useWorkflowProgressModel(instance: WorkflowInstance): WorkflowProgressViewProps {
	const token = useAtomValue(authTokenAtom);
	const user = useAtomValue(authUserAtom);
	const setWorkflowInstance = useSetAtom(workflowInstanceAtom);
	const [actionLoading, setActionLoading] = useState(false);
	const [expandedStage, setExpandedStage] = useState<number | null>(null);

	const isStarter = user?.id === instance.started_by;
	const currentStage = instance.stages[instance.current_stage];
	const canRevoke =
		instance.status === "active" &&
		currentStage?.status === "completed" &&
		instance.current_stage < instance.stages.length - 1;

	const handleRevoke = useCallback(async () => {
		if (!token) return;
		setActionLoading(true);
		try {
			await revokeWorkflowComplete(token, instance.id);
		} catch (err) {
			console.error("撤回完成失败:", err);
		} finally {
			setActionLoading(false);
		}
	}, [token, instance.id]);

	const handleTerminate = useCallback(async () => {
		if (!token) return;
		setActionLoading(true);
		try {
			await terminateWorkflow(token, instance.id);
			setWorkflowInstance((prev) => (prev ? { ...prev, status: "terminated" } : null));
		} catch (err) {
			console.error("终止工作流失败:", err);
		} finally {
			setActionLoading(false);
		}
	}, [token, instance.id, setWorkflowInstance]);

	const onToggleStage = useCallback((index: number) => {
		setExpandedStage((prev) => (prev === index ? null : index));
	}, []);

	const stages: WorkflowStageViewItem[] = instance.stages.map((stage, i) => {
		const style = getStatusStyle(stage.status);
		return {
			name: stage.name,
			description: stage.description,
			status: stage.status,
			statusLabel: style.label,
			statusBg: style.bg,
			statusText: style.text,
			memberIds: stage.member_ids,
			enteredAtLabel: stage.entered_at
				? new Date(stage.entered_at).toLocaleString("zh-CN")
				: null,
			completedAtLabel: stage.completed_at
				? new Date(stage.completed_at).toLocaleString("zh-CN")
				: null,
			isCurrent: i === instance.current_stage && instance.status === "active",
		};
	});

	const workflowStatusClassName =
		instance.status === "active"
			? "bg-blue-500/15 text-blue-400"
			: instance.status === "completed"
				? "bg-emerald-500/15 text-emerald-400"
				: "bg-zinc-500/15 text-zinc-400";

	return {
		labels: {
			members: "成员",
			noMembers: "无指定成员",
			enteredAt: "进入时间",
			completedAt: "完成时间",
			starter: "发起人",
		},
		workflowName: instance.workflow_name,
		workflowStatusLabel: WORKFLOW_STATUS_LABEL[instance.status] ?? instance.status,
		workflowStatusClassName,
		revokeButton: canRevoke ? (
			<Button
				variant="ghost"
				size="xs"
				onClick={handleRevoke}
				disabled={actionLoading}
				title="撤回当前阶段完成状态"
			>
				<span className="icon-[mdi--undo-variant] text-sm" />
				撤回
			</Button>
		) : null,
		terminateButton:
			isStarter && instance.status === "active" ? (
				<Button
					variant="ghost"
					size="xs"
					className="text-destructive hover:text-destructive"
					onClick={handleTerminate}
					disabled={actionLoading}
					title="终止工作流"
				>
					<span className="icon-[mdi--close-circle-outline] text-sm" />
					终止
				</Button>
			) : null,
		stages,
		expandedStage,
		onToggleStage,
		starterName: instance.starter_name,
		createdAtLabel: new Date(instance.created_at).toLocaleString("zh-CN"),
	};
}
