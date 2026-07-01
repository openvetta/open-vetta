import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { authTokenAtom, filePreviewAtom } from "@shared/store/atoms";
import {
	fetchColleagues,
	fetchFlowingHistory,
	fetchWorkflowInstanceByFlowing,
	flowingDownloadUrl,
	type ColleagueInfo,
	type FlowingTransferVO,
	type WorkflowInstance,
} from "@shared/lib/api";
import { useProjectProfile } from "@shared/lib/project-profile";

interface JourneyPanelProps {
	cwd: string;
}

// labelKey 存 i18n key（chat 命名空间），渲染期解析——模块级常量不放中文。
type StatusLabelKey =
	| "activityPanel.journey.statusPending"
	| "activityPanel.journey.statusInProgress"
	| "activityPanel.journey.statusCompleted"
	| "activityPanel.journey.statusReturned";
type TransferLabelKey =
	| "activityPanel.journey.transferPending"
	| "activityPanel.journey.transferAccepted"
	| "activityPanel.journey.transferRejected";
const STATUS_META: Record<string, { labelKey: StatusLabelKey; className: string }> = {
	pending: { labelKey: "activityPanel.journey.statusPending", className: "bg-zinc-500/15 text-zinc-400" },
	in_progress: { labelKey: "activityPanel.journey.statusInProgress", className: "bg-blue-500/15 text-blue-400" },
	completed: { labelKey: "activityPanel.journey.statusCompleted", className: "bg-emerald-500/15 text-emerald-400" },
	returned: { labelKey: "activityPanel.journey.statusReturned", className: "bg-red-500/15 text-red-400" },
};
const TRANSFER_STATUS_META: Record<string, { labelKey: TransferLabelKey; className: string }> = {
	pending: { labelKey: "activityPanel.journey.transferPending", className: "bg-zinc-500/15 text-zinc-400" },
	accepted: { labelKey: "activityPanel.journey.transferAccepted", className: "bg-emerald-500/15 text-emerald-400" },
	rejected: { labelKey: "activityPanel.journey.transferRejected", className: "bg-red-500/15 text-red-400" },
};

type HistoryNode = FlowingTransferVO & { children?: HistoryNode[] };
type DisplayUser = { name: string; avatar: string };

function formatDateTime(value: string | null): string {
	if (!value) return "—";
	return new Date(value).toLocaleString("zh-CN");
}

function getStatusMeta(status: string, t: TFunction<"chat">): { label: string; className: string } {
	const meta = STATUS_META[status];
	return meta
		? { label: t(meta.labelKey), className: meta.className }
		: { label: status, className: "bg-zinc-500/15 text-zinc-400" };
}

function getTransferStatusMeta(status: string, t: TFunction<"chat">): { label: string; className: string } {
	const meta = TRANSFER_STATUS_META[status];
	return meta
		? { label: t(meta.labelKey), className: meta.className }
		: { label: status, className: "bg-zinc-500/15 text-zinc-400" };
}

function fileName(path: string): string {
	return path.split("/").pop() ?? path;
}

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

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "ico", "tiff", "heic"]);

function inferKind(name: string): "image" | "file" {
	const ext = (name.split(".").pop() ?? "").toLowerCase();
	return IMAGE_EXTS.has(ext) ? "image" : "file";
}

function resolveUser(
	userId: number,
	usersMap: Map<number, ColleagueInfo>,
	transfers: FlowingTransferVO[],
	t: TFunction<"chat">,
): DisplayUser {
	const colleague = usersMap.get(userId);
	if (colleague) {
		return { name: colleague.username, avatar: colleague.avatar };
	}
	const sender = transfers.find((item) => item.sender_id === userId);
	if (sender) {
		return { name: sender.sender_name, avatar: sender.sender_avatar };
	}
	const receiver = transfers.find((item) => item.receiver_id === userId);
	if (receiver) {
		return { name: receiver.receiver_name, avatar: receiver.receiver_avatar };
	}
	return { name: t("activityPanel.journey.member", { id: userId }), avatar: "" };
}

function UserIdentity({
	name,
	avatar,
	className = "",
}: {
	name: string;
	avatar: string;
	className?: string;
}): JSX.Element {
	return (
		<div className={`flex min-w-0 items-center gap-1.5 ${className}`}>
			{avatar ? (
				<img src={avatar} alt={name} className="h-5 w-5 shrink-0 rounded-full border border-border object-cover" />
			) : (
				<div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40">
					<span className="icon-[mdi--account-outline] text-[11px] text-muted-foreground/70" />
				</div>
			)}
			<span className="truncate text-[11px] text-foreground/90">{name}</span>
		</div>
	);
}

export function JourneyPanel({ cwd }: JourneyPanelProps): JSX.Element {
	const { t } = useTranslation("chat");
	const token = useAtomValue(authTokenAtom);
	const setPreview = useSetAtom(filePreviewAtom);
	const { profile, loading: profileLoading } = useProjectProfile(cwd);

	const openFilePreview = useCallback(
		async (storageKey: string, displayName: string) => {
			if (!token || !storageKey) return;
			const url = await flowingDownloadUrl(token, storageKey);
			setPreview({ name: displayName, url, kind: inferKind(displayName) });
		},
		[token, setPreview],
	);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [instance, setInstance] = useState<WorkflowInstance | null>(null);
	const [historyCount, setHistoryCount] = useState(0);
	const [stageTransfersMap, setStageTransfersMap] = useState<Map<number, FlowingTransferVO[]>>(new Map());
	const [usersMap, setUsersMap] = useState<Map<number, ColleagueInfo>>(new Map());
	const [expandedTransferIds, setExpandedTransferIds] = useState<Set<number>>(new Set());

	const canLoad = !!token && !!profile?.isWorkflow && profile.flowingId !== null && profile.workflowInstanceId !== null;

	useEffect(() => {
		if (!canLoad || !token || profile?.flowingId === null) {
			setInstance(null);
			setHistoryCount(0);
			setStageTransfersMap(new Map());
			setUsersMap(new Map());
			setExpandedTransferIds(new Set());
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
			fetchColleagues(token).catch(() => [] as ColleagueInfo[]),
		])
			.then(([workflowInstance, historyData, colleagues]) => {
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

				const nextUsersMap = new Map<number, ColleagueInfo>();
				for (const item of colleagues) {
					nextUsersMap.set(item.id, item);
				}

				const defaultExpandedTransferIds = new Set<number>();
				const currentStageTransfers = stageTransfers.get(workflowInstance.current_stage) ?? [];
				if (currentStageTransfers.length > 0) {
					const latest = currentStageTransfers[currentStageTransfers.length - 1];
					defaultExpandedTransferIds.add(latest.id);
				}

				setInstance(workflowInstance);
				setHistoryCount(allTransfers.length);
				setStageTransfersMap(stageTransfers);
				setUsersMap(nextUsersMap);
				setExpandedTransferIds(defaultExpandedTransferIds);
			})
			.catch((err) => {
				if (cancelled) return;
				setInstance(null);
				setHistoryCount(0);
				setStageTransfersMap(new Map());
				setUsersMap(new Map());
				setExpandedTransferIds(new Set());
				setError(err instanceof Error ? err.message : t("activityPanel.journey.loadFailed"));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [canLoad, token, profile?.flowingId, t]);

	const completedCount = useMemo(() => {
		if (!instance) return 0;
		return instance.stages.filter((stage) => stage.status === "completed").length;
	}, [instance]);

	const toggleTransferDetails = useCallback((transferId: number) => {
		setExpandedTransferIds((prev) => {
			const next = new Set(prev);
			if (next.has(transferId)) {
				next.delete(transferId);
			} else {
				next.add(transferId);
			}
			return next;
		});
	}, []);

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
				<span className="text-[12px]">{t("activityPanel.journey.notWorkflow")}</span>
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
				<span className="text-[12px]">{t("activityPanel.journey.empty")}</span>
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="border-b border-border px-4 py-3">
				<div className="rounded-xl border border-border bg-gradient-to-b from-background to-muted/30 p-3">
					<div className="mb-1 flex items-center justify-between">
						<h3 className="text-[13px] font-semibold text-foreground">{instance.workflow_name}</h3>
						<span className="rounded-full bg-accent/70 px-2 py-0.5 text-[10px] text-muted-foreground">
							{t("activityPanel.journey.badge")}
						</span>
					</div>
					<div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
						<span>{t("activityPanel.journey.stageCount", { completed: completedCount, total: instance.stages.length })}</span>
						<span className="text-muted-foreground/40">•</span>
						<span>{t("activityPanel.journey.transferCount", { count: historyCount })}</span>
					</div>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
				<div className="space-y-3">
					{instance.stages.map((stage, index) => {
						const statusMeta = getStatusMeta(stage.status, t);
						const isLast = index === instance.stages.length - 1;
						const transfers = stageTransfersMap.get(index) ?? [];
						const stageSubtitle = stage.description?.trim() || t("activityPanel.journey.noSubtitle");
						const stageResultFiles = stage.file_list ?? [];
						const stageResultStorageKey = stage.file_storage_key ?? "";

						return (
							<div key={`${stage.name}-${index}`} className="relative pl-8">
								{!isLast && <div className="absolute left-[11px] top-6 h-[calc(100%-6px)] w-px bg-border" />}
								<div className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-[10px] font-semibold text-muted-foreground">
									{index + 1}
								</div>

								<div className="rounded-lg border border-border bg-background/90 p-3">
									<div className="mb-2 flex items-start justify-between gap-2">
										<div className="min-w-0">
											<div className="truncate text-[13px] font-semibold text-foreground">{stage.name}</div>
											<div className="mt-0.5 text-[11px] text-muted-foreground/70">{t("activityPanel.journey.subtitlePrefix", { subtitle: stageSubtitle })}</div>
										</div>
										<span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${statusMeta.className}`}>
											{statusMeta.label}
										</span>
									</div>

									<div className="mb-2 flex flex-wrap gap-1.5">
										{stage.member_ids.length > 0 ? (
											stage.member_ids.map((memberId) => {
												const member = resolveUser(memberId, usersMap, transfers, t);
												return (
													<div className="flex items-center px-2">
														<div className="text-[11px]">{t("activityPanel.journey.memberLabel")}</div>
													<div
														key={memberId}
														className="max-w-full"
													>
														<UserIdentity name={member.name} avatar={member.avatar} />
													</div>
													</div>
												);
											})
										) : (
											<span className="text-[10px] text-muted-foreground/50">{t("activityPanel.journey.noMembers")}</span>
										)}
									</div>

									<div className="grid grid-cols-1 gap-1.5 text-[11px] text-muted-foreground/70">
										<div className="rounded-md bg-muted/35 px-2 py-1.5">
											<div className="mb-px text-[10px] uppercase tracking-wide text-muted-foreground/45">
												{t("activityPanel.journey.enteredAt")}
											</div>
											<div className="font-medium text-foreground/80">{formatDateTime(stage.entered_at)}</div>
										</div>
										<div className="rounded-md bg-muted/35 px-2 py-1.5">
											<div className="mb-px text-[10px] uppercase tracking-wide text-muted-foreground/45">
												{t("activityPanel.journey.completedAt")}
											</div>
											<div className="font-medium text-foreground/80">{formatDateTime(stage.completed_at)}</div>
										</div>
									</div>

									{stageResultFiles.length > 0 && (
										<div className="mt-2 rounded-md border border-emerald-500 bg-emerald-500/5 px-2 py-1.5">
											<div className="mb-1 text-[10px] font-medium text-emerald-400">{t("activityPanel.journey.stageOutputFiles")}</div>
											<div className="flex flex-wrap gap-1">
												{stageResultFiles.map((file) => (
													<button
														type="button"
														key={`stage-file-${index}-${file}`}
														onClick={() => void openFilePreview(stageResultStorageKey, fileName(file))}
														disabled={!stageResultStorageKey}
														className="max-w-full truncate rounded bg-background/60 px-1.5 py-0.5 text-[10px] text-foreground/80 transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
														title={file}
													>
														{fileName(file)}
													</button>
												))}
											</div>
										</div>
									)}

									{transfers.length > 0 ? (
										<div className="relative mt-2 pl-4">
											<div className="absolute bottom-2 left-[3px] top-2 w-px bg-border" />
											<div className="space-y-2">
												{transfers.map((transfer) => {
													const transferStatusMeta = getTransferStatusMeta(transfer.status, t);
													const transferMessage = transfer.message?.trim() || t("activityPanel.journey.transferMessageEmpty");
													const isTransferExpanded = expandedTransferIds.has(transfer.id);
													return (
														<div key={transfer.id} className="relative">
															<div className="absolute -left-4 top-[12px] h-2 w-2 rounded-full bg-muted-foreground/45" />
															<div className="rounded-md border border-border bg-background/70 p-2">
																<div className="flex items-center gap-1.5">
																	<div className="flex shrink-0 items-center gap-1.5">
																		<span className={`rounded-full px-1.5 py-0.5 text-[9px] ${transferStatusMeta.className}`}>
																			{transferStatusMeta.label}
																		</span>
																		<button
																			type="button"
																			onClick={() => toggleTransferDetails(transfer.id)}
																			className="rounded bg-muted/45 px-1.5 py-0.5 text-[9px] text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
																		>
																			{isTransferExpanded ? t("activityPanel.journey.collapseDetails") : t("activityPanel.journey.expandDetails")}
																		</button>
																	</div>
																</div>
																<div className="mt-1 text-[10px] text-muted-foreground/55">{t("activityPanel.journey.senderReceiver")}</div>
																<div className="mt-1 flex min-w-0 items-center gap-2">
																	<UserIdentity
																		name={transfer.sender_name}
																		avatar={transfer.sender_avatar}
																		className="max-w-[40%]"
																	/>
																	<span className="icon-[mdi--arrow-right] shrink-0 text-[13px] text-muted-foreground/45" />
																	<UserIdentity
																		name={transfer.receiver_name}
																		avatar={transfer.receiver_avatar}
																		className="max-w-[40%]"
																	/>
																</div>
																<div className="mt-1 text-[10px] text-muted-foreground/65">
																	{t("activityPanel.journey.sentAt", { time: formatDateTime(transfer.created_at) })}
																</div>

																{isTransferExpanded && (
																	<div className="mt-2 space-y-1">
																		<div className="rounded bg-muted/30 px-1.5 py-1">
																			<div className="text-[10px] text-muted-foreground/55">{t("activityPanel.journey.subtitle")}</div>
																			<div className="mt-0.5 text-[10px] text-foreground/85">
																				{stage.name} · {transferStatusMeta.label}
																			</div>
																		</div>
																		<div className="rounded bg-muted/30 px-1.5 py-1">
																			<div className="flex items-center gap-1 text-[10px] text-muted-foreground/55">
																				<span className="icon-[mdi--message-text-outline] text-[11px]" />
																				{t("activityPanel.journey.attachedMessage")}
																			</div>
																			<div className="mt-0.5 text-[10px] text-foreground/85">
																				{transferMessage}
																			</div>
																		</div>
																		<div className="rounded bg-muted/30 px-1.5 py-1">
																			<div className="mb-0.5 flex items-center gap-1 text-[10px] text-muted-foreground/55">
																				<span className="icon-[mdi--paperclip] text-[11px]" />
																				{t("activityPanel.journey.attachedFiles")}
																			</div>
																			{transfer.file_list.length > 0 ? (
																				<div className="flex flex-wrap gap-1">
																					{transfer.file_list.map((file) => (
																						<button
																							type="button"
																							key={`${transfer.id}-${file}`}
																							onClick={() => void openFilePreview(transfer.file_storage_key, fileName(file))}
																							disabled={!transfer.file_storage_key}
																							className="max-w-full truncate rounded bg-background/70 px-1.5 py-0.5 text-[10px] text-foreground/75 transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
																							title={file}
																						>
																							{fileName(file)}
																						</button>
																					))}
																				</div>
																			) : (
																				<div className="text-[10px] text-muted-foreground/50">{t("activityPanel.journey.none")}</div>
																			)}
																		</div>
																	</div>
																)}
															</div>
														</div>
													);
												})}
											</div>
										</div>
									) : (
										<div className="mt-2 rounded bg-muted/20 px-2 py-1.5 text-[10px] text-muted-foreground/55">
											{t("activityPanel.journey.noTransfers")}
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
