import { flowingChatTotalUnreadAtom, flowingPendingCountAtom, notificationUnreadAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useState } from "react";
import type { MessageCenterTab } from "./types";

export function useMessageCenterModel(): {
	activeTab: MessageCenterTab;
	chatUnread: number;
	close: () => void;
	notifUnread: number;
	open: boolean;
	pendingCount: number;
	setActiveTab: (tab: MessageCenterTab) => void;
	setOpen: (open: boolean) => void;
	totalUnread: number;
} {
	const [open, setOpen] = useState(false);
	const [activeTab, setActiveTab] = useState<MessageCenterTab>("all");
	const pendingCount = useAtomValue(flowingPendingCountAtom);
	const chatUnread = useAtomValue(flowingChatTotalUnreadAtom);
	const notifUnread = useAtomValue(notificationUnreadAtom);
	const totalUnread = pendingCount + chatUnread + notifUnread;

	return {
		activeTab,
		chatUnread,
		close: () => setOpen(false),
		notifUnread,
		open,
		pendingCount,
		setActiveTab,
		setOpen,
		totalUnread,
	};
}
