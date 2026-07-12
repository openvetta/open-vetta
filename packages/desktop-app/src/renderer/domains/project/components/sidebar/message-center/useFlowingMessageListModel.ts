import { useFlowingReceive } from "@domains/flowing/hooks/useFlowingReceive";
import { flowingPendingListAtom } from "@shared/store/atoms";
import type { FlowingMessageListItemView, FlowingMessageListLabels } from "@vetta/theme-ui/sidebar";
import { useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatRelativeTime } from "./formatRelativeTime";

export interface FlowingMessageListModel {
	readonly labels: FlowingMessageListLabels;
	readonly items: readonly FlowingMessageListItemView[];
	readonly processing: boolean;
	readonly onAccept: (id: number) => void;
	readonly onReject: (id: number) => void;
}

export function useFlowingMessageListModel(): FlowingMessageListModel {
	const { t } = useTranslation("message");
	const pendingList = useAtomValue(flowingPendingListAtom);
	const { processing, accept, reject } = useFlowingReceive();

	const byId = useMemo(() => new Map(pendingList.map((tx) => [tx.id, tx])), [pendingList]);

	const items = useMemo<FlowingMessageListItemView[]>(
		() =>
			pendingList.map((tx) => ({
				id: tx.id,
				senderName: tx.sender_name,
				projectName: tx.project_name,
				message: tx.message ?? null,
				fileCountLabel: t("flowing.fileCount", { count: tx.file_list.length }),
				relativeTime: formatRelativeTime(tx.created_at),
			})),
		[pendingList, t],
	);

	const labels = useMemo<FlowingMessageListLabels>(
		() => ({
			emptyText: t("empty.flowing"),
			emptyIcon: "icon-[solar--transfer-horizontal-linear]",
			shared: t("flowing.shared"),
			reject: t("flowing.reject"),
			accept: t("flowing.accept"),
			processing: t("flowing.processing"),
		}),
		[t],
	);

	const onAccept = useCallback(
		(id: number) => {
			const tx = byId.get(id);
			if (tx) void accept(tx);
		},
		[accept, byId],
	);

	const onReject = useCallback(
		(id: number) => {
			const tx = byId.get(id);
			if (tx) void reject(tx);
		},
		[byId, reject],
	);

	return { labels, items, processing, onAccept, onReject };
}
