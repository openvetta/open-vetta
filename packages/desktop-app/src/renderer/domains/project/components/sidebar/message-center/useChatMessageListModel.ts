import {
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	flowingChatSummaryAtom,
	projectsAtom,
} from "@shared/store/atoms";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatRelativeTime } from "./formatRelativeTime";

export interface ChatMessageListItemView {
	readonly flowingId: number;
	readonly title: string;
	readonly preview: string;
	readonly unreadCount: number;
	readonly relativeTime: string | null;
}

export interface ChatMessageListModel {
	readonly emptyText: string;
	readonly emptyIcon: string;
	readonly items: readonly ChatMessageListItemView[];
	readonly onSelect: (flowingId: number) => void;
}

export function useChatMessageListModel(onClose: () => void): ChatMessageListModel {
	const { t } = useTranslation("message");
	const summaryMap = useAtomValue(flowingChatSummaryAtom);
	const projects = useAtomValue(projectsAtom);
	const navigate = useNavigate();
	const setActivityOpen = useSetAtom(activityPanelOpenAtom);
	const setTabByProject = useSetAtom(activityPanelTabByProjectAtom);

	const items = useMemo((): ChatMessageListItemView[] => {
		return Array.from(summaryMap.values())
			.filter((summary) => summary.unread_count > 0)
			.sort((a, b) => {
				const timeA = a.last_created_at ? new Date(a.last_created_at).getTime() : 0;
				const timeB = b.last_created_at ? new Date(b.last_created_at).getTime() : 0;
				return timeB - timeA;
			})
			.map((summary) => ({
				flowingId: summary.flowing_id,
				title: summary.project_name || t("chat.flowingFallback", { id: summary.flowing_id }),
				preview: `${summary.last_sender ? `${summary.last_sender}${t("chat.senderSuffix")}` : ""}${
					summary.last_content || t("chat.newMessage")
				}`,
				unreadCount: summary.unread_count,
				relativeTime: summary.last_created_at ? formatRelativeTime(summary.last_created_at) : null,
			}));
	}, [summaryMap, t]);

	const cwdByFlowing = useMemo(() => {
		const map = new Map<number, string>();
		for (const project of projects) {
			if (project.flowingId != null) map.set(project.flowingId, project.cwd);
		}
		return map;
	}, [projects]);

	const onSelect = (flowingId: number): void => {
		const cwd = cwdByFlowing.get(flowingId);
		if (!cwd) {
			alert(t("chat.notInWorkspace"));
			return;
		}

		setTabByProject((prev) => {
			const next = new Map(prev);
			next.set(cwd, "chat");
			return next;
		});
		setActivityOpen(true);
		void navigate({ to: "/project/$cwd", params: { cwd: encodeURIComponent(cwd) } });
		onClose();
	};

	return {
		emptyText: t("empty.chat"),
		emptyIcon: "icon-[solar--chat-round-line-linear]",
		items,
		onSelect,
	};
}
