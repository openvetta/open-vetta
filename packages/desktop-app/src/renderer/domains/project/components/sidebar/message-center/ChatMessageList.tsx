import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue, useSetAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	flowingChatSummaryAtom,
	projectsAtom,
} from "@shared/store/atoms";
import { formatRelativeTime } from "./formatRelativeTime";
import { MessageCenterEmptyState } from "./MessageCenterEmptyState";
import { MESSAGE_CENTER_SPRING } from "./types";

export function ChatMessageList({ onClose }: { onClose: () => void }): JSX.Element {
	const { t } = useTranslation("message");
	const summaryMap = useAtomValue(flowingChatSummaryAtom);
	const projects = useAtomValue(projectsAtom);
	const navigate = useNavigate();
	const setActivityOpen = useSetAtom(activityPanelOpenAtom);
	const setTabByProject = useSetAtom(activityPanelTabByProjectAtom);

	const items = useMemo(() => {
		return Array.from(summaryMap.values())
			.filter((summary) => summary.unread_count > 0)
			.sort((a, b) => {
				const timeA = a.last_created_at ? new Date(a.last_created_at).getTime() : 0;
				const timeB = b.last_created_at ? new Date(b.last_created_at).getTime() : 0;
				return timeB - timeA;
			});
	}, [summaryMap]);

	if (items.length === 0) {
		return <MessageCenterEmptyState text={t("empty.chat")} icon="icon-[solar--chat-round-line-linear]" />;
	}

	const cwdByFlowing = new Map<number, string>();
	for (const project of projects) {
		if (project.flowingId != null) cwdByFlowing.set(project.flowingId, project.cwd);
	}

	const handleClick = (flowingId: number): void => {
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

	return (
		<div className="flex flex-col gap-1.5 p-3">
			{items.map((summary) => (
				<motion.button
					key={summary.flowing_id}
					layout
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={MESSAGE_CENTER_SPRING}
					type="button"
					onClick={() => handleClick(summary.flowing_id)}
					className="group rounded-xl border border-border/60 bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
				>
					<div className="flex items-start gap-3">
						<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
							<span className="icon-[solar--chat-round-line-linear] h-4 w-4 text-primary" />
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex items-center justify-between gap-2">
								<p className="truncate text-[12px] font-semibold text-foreground">
									{summary.project_name || t("chat.flowingFallback", { id: summary.flowing_id })}
								</p>
								<span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
									{summary.unread_count}
								</span>
							</div>
							<p className="mt-1 truncate text-[11px] text-muted-foreground">
								{summary.last_sender ? `${summary.last_sender}${t("chat.senderSuffix")}` : ""}
								{summary.last_content || t("chat.newMessage")}
							</p>
							{summary.last_created_at && (
								<p className="mt-1 text-[10px] text-muted-foreground/50">
									{formatRelativeTime(summary.last_created_at)}
								</p>
							)}
						</div>
					</div>
				</motion.button>
			))}
		</div>
	);
}
