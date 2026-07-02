import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { ChatMessageList } from "./ChatMessageList";
import { FlowingMessageList } from "./FlowingMessageList";
import { MessageCenterEmptyState } from "./MessageCenterEmptyState";
import { NotificationMessageList } from "./NotificationMessageList";
import type { MessageCenterTab } from "./types";

export function MessageCenterContent({
	activeTab,
	chatUnread,
	notifUnread,
	pendingCount,
	onClose,
}: {
	activeTab: MessageCenterTab;
	chatUnread: number;
	notifUnread: number;
	pendingCount: number;
	onClose: () => void;
}): JSX.Element {
	const { t } = useTranslation("message");

	return (
		<div className="min-h-[160px] flex-1 overflow-y-auto border-t border-border/50">
			<AnimatePresence mode="wait" initial={false}>
				<motion.div
					key={activeTab}
					initial={{ opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -6 }}
					transition={{ duration: 0.15 }}
				>
					{activeTab === "all" && (
						<>
							{chatUnread > 0 && <ChatMessageList onClose={onClose} />}
							{pendingCount > 0 && <FlowingMessageList />}
							{notifUnread > 0 && <NotificationMessageList />}
							{chatUnread === 0 && pendingCount === 0 && notifUnread === 0 && (
								<MessageCenterEmptyState text={t("empty.all")} icon="icon-[solar--inbox-linear]" />
							)}
						</>
					)}
					{activeTab === "chat" && <ChatMessageList onClose={onClose} />}
					{activeTab === "notifications" && <NotificationMessageList />}
					{activeTab === "flowing" && <FlowingMessageList />}
				</motion.div>
			</AnimatePresence>
		</div>
	);
}
