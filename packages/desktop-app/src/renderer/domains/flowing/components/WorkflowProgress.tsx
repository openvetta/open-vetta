import { useCallback, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { Button } from "@shared/components/ui/button";
import {
	revokeWorkflowComplete,
	terminateWorkflow,
	type WorkflowInstance,
} from "@shared/lib/api";
import { authTokenAtom, authUserAtom, workflowInstanceAtom } from "@shared/store/atoms";

interface WorkflowProgressProps {
	instance: WorkflowInstance;
}

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
	return STATUS_STYLES[status] ?? STATUS_STYLES.pending;
}

export function WorkflowProgress({ instance }: WorkflowProgressProps): JSX.Element {
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

	const toggleStage = useCallback((index: number) => {
		setExpandedStage((prev) => (prev === index ? null : index));
	}, []);

	const workflowStatusLabel = WORKFLOW_STATUS_LABEL[instance.status] ?? instance.status;

	return (
		<div className="flex flex-col gap-3">
			{/* 标题行 */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2.5">
					<div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/60">
						<span className="icon-[mdi--sitemap-outline] h-3.5 w-3.5 text-muted-foreground" />
					</div>
					<h2 className="text-[13px] font-semibold text-foreground">{instance.workflow_name}</h2>
					<span
						className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
							instance.status === "active"
								? "bg-blue-500/15 text-blue-400"
								: instance.status === "completed"
									? "bg-emerald-500/15 text-emerald-400"
									: "bg-zinc-500/15 text-zinc-400"
						}`}
					>
						{workflowStatusLabel}
					</span>
				</div>
				<div className="flex items-center gap-1.5">
					{canRevoke && (
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
					)}
					{isStarter && instance.status === "active" && (
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
					)}
				</div>
			</div>

			{/* 阶段进度条 */}
			<div className="rounded-xl border border-border/30 bg-muted/10 p-4">
				<div className="flex items-center gap-1">
					{instance.stages.map((stage, i) => {
						const style = getStatusStyle(stage.status);
						const isCurrent = i === instance.current_stage && instance.status === "active";
						return (
							<div key={i} className="flex flex-1 items-center gap-1">
								<button
									type="button"
									onClick={() => toggleStage(i)}
									className={`flex-1 rounded-md px-2 py-1.5 text-center transition-all ${style.bg} ${
										isCurrent ? "ring-1 ring-blue-400/50" : ""
									}`}
									title={`${stage.name} - ${style.label}`}
								>
									<div className={`truncate text-[11px] font-medium ${style.text}`}>
										{stage.name}
									</div>
								</button>
								{i < instance.stages.length - 1 && (
									<span className="icon-[mdi--chevron-right] shrink-0 text-xs text-muted-foreground/30" />
								)}
							</div>
						);
					})}
				</div>

				{/* 展开的阶段详情 */}
				{expandedStage !== null && instance.stages[expandedStage] && (
					<div className="mt-3 rounded-lg border border-border/20 bg-background/50 p-3">
						<div className="mb-2 flex items-center justify-between">
							<span className="text-[12px] font-medium text-foreground">
								{instance.stages[expandedStage].name}
							</span>
							<span
								className={`rounded px-1.5 py-px text-[10px] ${getStatusStyle(instance.stages[expandedStage].status).bg} ${getStatusStyle(instance.stages[expandedStage].status).text}`}
							>
								{getStatusStyle(instance.stages[expandedStage].status).label}
							</span>
						</div>
						{instance.stages[expandedStage].description && (
							<p className="mb-2 text-[11px] text-muted-foreground/70">
								{instance.stages[expandedStage].description}
							</p>
						)}
						<div className="flex flex-wrap gap-1">
							<span className="text-[10px] text-muted-foreground/50">成员:</span>
							{instance.stages[expandedStage].member_ids.length > 0 ? (
								instance.stages[expandedStage].member_ids.map((id) => (
									<span
										key={id}
										className="rounded bg-accent/50 px-1.5 py-px text-[10px] text-muted-foreground"
									>
										ID:{id}
									</span>
								))
							) : (
								<span className="text-[10px] text-muted-foreground/40">无指定成员</span>
							)}
						</div>
						{instance.stages[expandedStage].entered_at && (
							<div className="mt-1.5 text-[10px] text-muted-foreground/40">
								进入时间: {new Date(instance.stages[expandedStage].entered_at!).toLocaleString("zh-CN")}
							</div>
						)}
						{instance.stages[expandedStage].completed_at && (
							<div className="text-[10px] text-muted-foreground/40">
								完成时间: {new Date(instance.stages[expandedStage].completed_at!).toLocaleString("zh-CN")}
							</div>
						)}
					</div>
				)}
			</div>

			{/* 发起人信息 */}
			<div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
				<span className="icon-[mdi--account-outline] text-xs" />
				<span>发起人: {instance.starter_name}</span>
				<span>|</span>
				<span>{new Date(instance.created_at).toLocaleString("zh-CN")}</span>
			</div>
		</div>
	);
}
