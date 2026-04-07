import { useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { authTokenAtom } from "@shared/store/atoms";
import {
	fetchFlowingHistory,
	fetchWorkflowInstanceByFlowing,
	type FlowingTransferVO,
	type WorkflowInstance,
} from "@shared/lib/api";
import { useProjectProfile } from "@shared/lib/project-profile";

interface JourneyPanelProps {
	cwd: string;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
	pending: { label: "待处理", className: "bg-zinc-500/15 text-zinc-400" },
	in_progress: { label: "进行中", className: "bg-blue-500/15 text-blue-400" },
	completed: { label: "已完成", className: "bg-emerald-500/15 text-emerald-400" },
	returned: { label: "已退回", className: "bg-red-500/15 text-red-400" },
};
const TRANSFER_STATUS_META: Record<string, { label: string; className: string }> = {
	pending: { label: "待处理", className: "bg-zinc-500/15 text-zinc-400" },
	accepted: { label: "已接受", className: "bg-emerald-500/15 text-emerald-400" },
	rejected: { label: "已拒绝", className: "bg-red-500/15 text-red-400" },
};

function formatDateTime(value: string | null): string {
	if (!value) return "—";
	return new Date(value).toLocaleString("zh-CN");
}

function getStatusMeta(status: string): { label: string; className: string } {
	return STATUS_META[status] ?? { label: status, className: "bg-zinc-500/15 text-zinc-400" };
}

function getTransferStatusMeta(status: string): { label: string; className: string } {
	return TRANSFER_STATUS_META[status] ?? { label: status, className: "bg-zinc-500/15 text-zinc-400" };
}

function fileName(path: string): string {
	return path.split("/").pop() ?? path;
}

type HistoryNode = FlowingTransferVO & { children?: HistoryNode[] };

function flattenHistory(list: HistoryNode[]): FlowingTransferVO[] {
	const result: FlowingTransferVO[] = [];
	const walk = (node: HistoryNode) => {
		result.push(node);
		if (node.children?.length) {
			for (const child of node.children) walk(child);
		}
	};
	for (const item of list) walk(item);
	return result;
}

function buildUserStageIndexMap(instance: WorkflowInstance): Map<number, number[]> {
	const map = new Map<number, number[]>();
	instance.stages.forEach((stage, index) => {
		for (const memberId of stage.member_ids) {
			const indexes = map.get(memberId) ?? [];
			if (!indexes.includes(index)) indexes.push(index);
			map.set(memberId, indexes);
		}
	});
	return map;
}

function normalizeStageIndex(raw: number, stageCount: number): number | null {
	if (raw >= 0 && raw < stageCount) return raw;
	if (raw >= 1 && raw <= stageCount) return raw - 1;
	return null;
}

function resolveTransferStageIndex(
	transfer: FlowingTransferVO,
	userStageIndexMap: Map<number, number[]>,
	stageCount: number,
): number | null {
	const senderStages = userStageIndexMap.get(transfer.sender_id) ?? [];
	const receiverStages = userStageIndexMap.get(transfer.receiver_id) ?? [];

	if (transfer.stage_index !== null) {
		const normalized = normalizeStageIndex(transfer.stage_index, stageCount);
		if (normalized !== null) {
			if (senderStages.includes(normalized)) return normalized;
			if (senderStages.length === 0 && receiverStages.includes(normalized)) return normalized;
		}
	}

	if (senderStages.length > 0) return senderStages[0];
	if (receiverStages.length > 0) return receiverStages[0];
	return null;
}

export function JourneyPanel({ cwd }: JourneyPanelProps): JSX.Element {
	const token = useAtomValue(authTokenAtom);
	const { profile, loading: profileLoading } = useProjectProfile(cwd);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [instance, setInstance] = useState<WorkflowInstance | null>(null);
	const [historyCount, setHistoryCount] = useState(0);
	const [stageTransfersMap, setStageTransfersMap] = useState<Map<number, FlowingTransferVO[]>>(new Map());

	const canLoad = !!token && !!profile?.isWorkflow && profile.flowingId !== null && profile.workflowInstanceId !== null;

	useEffect(() => {
		if (!canLoad || !token || profile?.flowingId === null) {
			setInstance(null);
			setHistoryCount(0);
			setStageTransfersMap(new Map());
			setLoading(false);
			setError(null);
			return;
		}

		let cancelled = false;
		setLoading(true);
		setError(null);

		void Promise.all([
			fetchWorkflowInstanceByFlowing(token, profile.flowingId),
			fetchFlowingHistory(token, profile.flowingId),
		])
			.then(([workflowInstance, historyData]) => {
				if (cancelled) return;
				const allTransfers = flattenHistory(historyData.history as HistoryNode[]);
				const userStageIndexMap = buildUserStageIndexMap(workflowInstance);
				const stageTransfers = new Map<number, FlowingTransferVO[]>();
				for (const transfer of allTransfers) {
					const stageIndex = resolveTransferStageIndex(
						transfer,
						userStageIndexMap,
						workflowInstance.stages.length,
					);
					if (stageIndex === null) continue;
					const list = stageTransfers.get(stageIndex) ?? [];
					list.push(transfer);
					stageTransfers.set(stageIndex, list);
				}
				for (const [stageIndex, list] of stageTransfers) {
					stageTransfers.set(
						stageIndex,
						[...list].sort(
							(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
						),
					);
				}
				setInstance(workflowInstance);
				setHistoryCount(allTransfers.length);
				setStageTransfersMap(stageTransfers);
			})
			.catch((err) => {
				if (cancelled) return;
				setInstance(null);
				setHistoryCount(0);
				setStageTransfersMap(new Map());
				setError(err instanceof Error ? err.message : "加载历程失败");
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [canLoad, token, profile?.flowingId]);

	const completedCount = useMemo(() => {
		if (!instance) return 0;
		return instance.stages.filter((stage) => stage.status === "completed").length;
	}, [instance]);

	if (profileLoading || loading) {
		return (
			<div className="flex h-full items-center justify-center">
				<span className="icon-[mdi--loading] h-5 w-5 animate-spin text-muted-foreground/50" />
			</div>
		);
	}

	if (!profile?.isWorkflow) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground/50">
				<span className="icon-[mdi--timeline-outline] text-[28px]" />
				<span className="text-[12px]">当前项目不是工作流项目</span>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex h-full items-center justify-center px-4 text-center text-[12px] text-muted-foreground/60">
				{error}
			</div>
		);
	}

	if (!instance) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground/50">
				<span className="icon-[mdi--timeline-outline] text-[28px]" />
				<span className="text-[12px]">暂无工作流历程</span>
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="border-b border-border/70 px-4 py-3">
				<div className="rounded-xl border border-border/50 bg-gradient-to-b from-background to-muted/30 p-3">
					<div className="mb-1 flex items-center justify-between">
						<h3 className="text-[13px] font-semibold text-foreground">{instance.workflow_name}</h3>
						<span className="rounded-full bg-accent/70 px-2 py-0.5 text-[10px] text-muted-foreground">
							历程
						</span>
					</div>
					<div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
						<span>环节 {completedCount}/{instance.stages.length}</span>
						<span className="text-muted-foreground/40">•</span>
						<span>流转记录 {historyCount}</span>
					</div>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
				<div className="space-y-3">
					{instance.stages.map((stage, index) => {
						const statusMeta = getStatusMeta(stage.status);
						const isLast = index === instance.stages.length - 1;
						const completionFiles = stage.file_list ?? [];
						const transfers = stageTransfersMap.get(index) ?? [];
						const transferFiles = Array.from(
							new Set(
								transfers.flatMap((transfer) => transfer.file_list),
							),
						);
						return (
							<div key={`${stage.name}-${index}`} className="relative pl-8">
								{!isLast && <div className="absolute left-[11px] top-6 h-[calc(100%-6px)] w-px bg-border/60" />}
								<div className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-border/70 bg-background text-[10px] font-semibold text-muted-foreground">
									{index + 1}
								</div>
								<div className="rounded-lg border border-border/50 bg-background/90 p-3">
									<div className="mb-1.5 flex items-start justify-between gap-2">
										<div className="min-w-0">
											<div className="truncate text-[13px] font-semibold text-foreground">{stage.name}</div>
											{stage.description && (
												<p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground/75">
													{stage.description}
												</p>
											)}
										</div>
										<span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${statusMeta.className}`}>
											{statusMeta.label}
										</span>
									</div>

									<div className="mb-2 flex flex-wrap gap-1">
										{stage.member_ids.length > 0 ? (
											stage.member_ids.map((memberId) => (
												<span
													key={memberId}
													className="rounded-md bg-accent/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
												>
													成员 ID {memberId}
												</span>
											))
										) : (
											<span className="text-[10px] text-muted-foreground/50">无指定成员</span>
										)}
									</div>

									<div className="grid grid-cols-1 gap-1.5 text-[11px] text-muted-foreground/70">
										<div className="rounded-md bg-muted/35 px-2 py-1.5">
											<div className="mb-px text-[10px] uppercase tracking-wide text-muted-foreground/45">
												进入时间
											</div>
											<div className="font-medium text-foreground/80">{formatDateTime(stage.entered_at)}</div>
										</div>
										<div className="rounded-md bg-muted/35 px-2 py-1.5">
											<div className="mb-px text-[10px] uppercase tracking-wide text-muted-foreground/45">
												完成时间
											</div>
											<div className="font-medium text-foreground/80">{formatDateTime(stage.completed_at)}</div>
										</div>
									</div>

									{(completionFiles.length > 0 || transferFiles.length > 0) && (
										<div className="mt-2 grid grid-cols-1 gap-1.5 text-[11px]">
											{completionFiles.length > 0 && (
												<div className="rounded-md border border-emerald-500/25 bg-emerald-500/5 px-2 py-1.5">
													<div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-emerald-400">
														<span className="icon-[mdi--check-circle-outline] text-[11px]" />
														环节成果附件
													</div>
													<div className="flex flex-wrap gap-1">
														{completionFiles.map((file) => (
															<span
																key={`completion-${index}-${file}`}
																className="max-w-full truncate rounded bg-background/60 px-1.5 py-0.5 text-[10px] text-foreground/75"
																title={file}
															>
																{fileName(file)}
															</span>
														))}
													</div>
												</div>
											)}
											{transferFiles.length > 0 && (
												<div className="rounded-md border border-border/50 bg-muted/20 px-2 py-1.5">
													<div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-muted-foreground/85">
														<span className="icon-[mdi--paperclip] text-[11px]" />
														流转附件
													</div>
													<div className="flex flex-wrap gap-1">
														{transferFiles.map((file) => (
															<span
																key={`transfer-${index}-${file}`}
																className="max-w-full truncate rounded bg-background/60 px-1.5 py-0.5 text-[10px] text-foreground/75"
																title={file}
															>
																{fileName(file)}
															</span>
														))}
													</div>
												</div>
											)}
										</div>
									)}

									{transfers.length > 0 && (
										<div className="mt-2 rounded-md border border-border/50 bg-muted/15 px-2 py-1.5">
											<div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-muted-foreground/85">
												<span className="icon-[mdi--transit-connection-variant] text-[11px]" />
												流转环节记录
											</div>
											<div className="space-y-1">
												{transfers.map((transfer) => {
													const transferStatusMeta = getTransferStatusMeta(transfer.status);
													return (
														<div
															key={transfer.id}
															className="rounded-md border border-border/40 bg-background/70 px-2 py-1.5"
														>
															<div className="mb-1 flex items-center justify-between gap-2">
																<div className="min-w-0 truncate text-[10px] font-medium text-foreground/90">
																	{transfer.sender_name} → {transfer.receiver_name}
																</div>
																<span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] ${transferStatusMeta.className}`}>
																	{transferStatusMeta.label}
																</span>
															</div>
															<div className="mb-1 text-[10px] text-muted-foreground/65">
																发送时间 {formatDateTime(transfer.created_at)}
															</div>
															{transfer.message && (
																<div className="mb-1 rounded bg-muted/35 px-1.5 py-1 text-[10px] text-foreground/80">
																	{transfer.message}
																</div>
															)}
															{transfer.file_list.length > 0 ? (
																<div className="flex flex-wrap gap-1">
																	{transfer.file_list.map((file) => (
																		<span
																			key={`${transfer.id}-${file}`}
																			className="max-w-full truncate rounded bg-background/70 px-1.5 py-0.5 text-[10px] text-foreground/75"
																			title={file}
																		>
																			{fileName(file)}
																		</span>
																	))}
																</div>
															) : (
																<div className="text-[10px] text-muted-foreground/50">未附文件</div>
															)}
														</div>
													);
												})}
											</div>
										</div>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
