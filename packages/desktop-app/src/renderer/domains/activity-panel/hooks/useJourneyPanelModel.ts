import {
	type ColleagueInfo,
	type FlowingTransferVO,
	fetchColleagues,
	fetchFlowingHistory,
	fetchWorkflowInstanceByFlowing,
	flowingDownloadUrl,
	type WorkflowInstance,
} from "@shared/lib/api";
import { useProjectProfile } from "@shared/lib/project-profile";
import { authTokenAtom, filePreviewAtom } from "@shared/store/atoms";
import type {
	JourneyFileItem,
	JourneyPanelViewLabels,
	JourneyPanelViewState,
	JourneyStageViewItem,
	JourneyTransferViewItem,
} from "@vetta/theme-ui/activity";
import type { TFunction } from "i18next";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

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

export function useJourneyPanelModel(cwd: string): JourneyPanelViewState {
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

	const canLoad =
		!!token && !!profile?.isWorkflow && profile.flowingId !== null && profile.workflowInstanceId !== null;

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
						[...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
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

	const onOpenFile = useCallback(
		(storageKey: string, displayName: string) => {
			void openFilePreview(storageKey, displayName);
		},
		[openFilePreview],
	);

	if (profileLoading || loading) {
		return { kind: "loading" };
	}

	if (!profile?.isWorkflow) {
		return { kind: "notWorkflow", labels: { notWorkflow: t("activityPanel.journey.notWorkflow") } };
	}

	if (error) {
		return { kind: "error", message: error };
	}

	if (!instance) {
		return { kind: "empty", labels: { empty: t("activityPanel.journey.empty") } };
	}

	const labels: JourneyPanelViewLabels = {
		badge: t("activityPanel.journey.badge"),
		stageCount: t("activityPanel.journey.stageCount", {
			completed: completedCount,
			total: instance.stages.length,
		}),
		transferCount: t("activityPanel.journey.transferCount", { count: historyCount }),
		memberLabel: t("activityPanel.journey.memberLabel"),
		noMembers: t("activityPanel.journey.noMembers"),
		enteredAt: t("activityPanel.journey.enteredAt"),
		completedAt: t("activityPanel.journey.completedAt"),
		stageOutputFiles: t("activityPanel.journey.stageOutputFiles"),
		senderReceiver: t("activityPanel.journey.senderReceiver"),
		subtitle: t("activityPanel.journey.subtitle"),
		attachedMessage: t("activityPanel.journey.attachedMessage"),
		attachedFiles: t("activityPanel.journey.attachedFiles"),
		none: t("activityPanel.journey.none"),
		noTransfers: t("activityPanel.journey.noTransfers"),
		notWorkflow: t("activityPanel.journey.notWorkflow"),
		empty: t("activityPanel.journey.empty"),
	};

	const stages: JourneyStageViewItem[] = instance.stages.map((stage, index) => {
		const statusMeta = getStatusMeta(stage.status, t);
		const transfers = stageTransfersMap.get(index) ?? [];
		const stageSubtitle = stage.description?.trim() || t("activityPanel.journey.noSubtitle");
		const stageResultFiles = stage.file_list ?? [];
		const stageResultStorageKey = stage.file_storage_key ?? "";

		const transferViews: JourneyTransferViewItem[] = transfers.map((transfer) => {
			const transferStatusMeta = getTransferStatusMeta(transfer.status, t);
			const transferMessage = transfer.message?.trim() || t("activityPanel.journey.transferMessageEmpty");
			const isTransferExpanded = expandedTransferIds.has(transfer.id);
			const files: JourneyFileItem[] = transfer.file_list.map((file) => ({
				key: `${transfer.id}-${file}`,
				name: fileName(file),
				title: file,
				storageKey: transfer.file_storage_key,
				disabled: !transfer.file_storage_key,
			}));
			return {
				id: transfer.id,
				statusLabel: transferStatusMeta.label,
				statusClassName: transferStatusMeta.className,
				sender: { name: transfer.sender_name, avatar: transfer.sender_avatar },
				receiver: { name: transfer.receiver_name, avatar: transfer.receiver_avatar },
				sentAtLabel: t("activityPanel.journey.sentAt", { time: formatDateTime(transfer.created_at) }),
				isExpanded: isTransferExpanded,
				expandToggleLabel: isTransferExpanded
					? t("activityPanel.journey.collapseDetails")
					: t("activityPanel.journey.expandDetails"),
				subtitleDetail: `${stage.name} · ${transferStatusMeta.label}`,
				message: transferMessage,
				files,
			};
		});

		const resultFiles: JourneyFileItem[] = stageResultFiles.map((file) => ({
			key: `stage-file-${index}-${file}`,
			name: fileName(file),
			title: file,
			storageKey: stageResultStorageKey,
			disabled: !stageResultStorageKey,
		}));

		return {
			key: `${stage.name}-${index}`,
			index,
			isLast: index === instance.stages.length - 1,
			name: stage.name,
			subtitle: t("activityPanel.journey.subtitlePrefix", { subtitle: stageSubtitle }),
			statusLabel: statusMeta.label,
			statusClassName: statusMeta.className,
			members: stage.member_ids.map((memberId) => {
				const member = resolveUser(memberId, usersMap, transfers, t);
				return { id: memberId, name: member.name, avatar: member.avatar };
			}),
			enteredAt: formatDateTime(stage.entered_at),
			completedAt: formatDateTime(stage.completed_at),
			resultFiles,
			transfers: transferViews,
		};
	});

	return {
		kind: "ready",
		workflowName: instance.workflow_name,
		labels,
		stages,
		onToggleTransfer: toggleTransferDetails,
		onOpenFile,
	};
}
