import { useTranslation } from "react-i18next";
import { useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import {
	authTokenAtom,
	notificationUnreadAtom,
	notificationsAtom,
} from "@shared/store/atoms";
import {
	clearReadNotifications,
	deleteNotification,
	markAllNotificationsRead,
	markNotificationRead,
	type NotificationVO,
} from "@shared/lib/api";
import { cn } from "@shared/lib/utils";
import { formatRelativeTime } from "./formatRelativeTime";
import { MessageCenterEmptyState } from "./MessageCenterEmptyState";
import { MessageCenterToolbarButton } from "./MessageCenterToolbarButton";
import { MESSAGE_CENTER_SPRING } from "./types";

export function NotificationMessageList(): JSX.Element {
	const { t } = useTranslation("message");
	const token = useAtomValue(authTokenAtom);
	const notifications = useAtomValue(notificationsAtom);
	const setNotifications = useSetAtom(notificationsAtom);
	const setUnread = useSetAtom(notificationUnreadAtom);

	const hasUnread = notifications.some((notification) => !notification.read);
	const hasRead = notifications.some((notification) => notification.read);

	const markRead = (notification: NotificationVO): void => {
		if (notification.read || !token) return;
		setNotifications((prev) =>
			prev.map((item) => (item.id === notification.id ? { ...item, read: true } : item)),
		);
		setUnread((prev) => Math.max(0, prev - 1));
		void markNotificationRead(token, notification.id).catch(console.error);
	};

	const handleReadAll = (): void => {
		if (!token) return;
		setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
		setUnread(0);
		void markAllNotificationsRead(token).catch(console.error);
	};

	const handleDelete = (notification: NotificationVO): void => {
		if (!token) return;
		setNotifications((prev) => prev.filter((item) => item.id !== notification.id));
		if (!notification.read) setUnread((prev) => Math.max(0, prev - 1));
		void deleteNotification(token, notification.id).catch(console.error);
	};

	const handleClearRead = (): void => {
		if (!token) return;
		setNotifications((prev) => prev.filter((item) => !item.read));
		void clearReadNotifications(token).catch(console.error);
	};

	if (notifications.length === 0) {
		return <MessageCenterEmptyState text={t("empty.notifications")} icon="icon-[solar--bell-linear]" />;
	}

	return (
		<div className="flex flex-col gap-1.5 p-3">
			{(hasUnread || hasRead) && (
				<div className="flex justify-end gap-1.5 px-0.5">
					{hasUnread && (
						<MessageCenterToolbarButton icon="icon-[solar--check-read-linear]" onClick={handleReadAll}>
							{t("notification.markAllRead")}
						</MessageCenterToolbarButton>
					)}
					{hasRead && (
						<MessageCenterToolbarButton
							icon="icon-[solar--notification-lines-remove-linear]"
							onClick={handleClearRead}
						>
							{t("notification.clearRead")}
						</MessageCenterToolbarButton>
					)}
				</div>
			)}
			<AnimatePresence initial={false} mode="popLayout">
				{notifications.map((notification) => (
					<motion.div
						key={notification.id}
						layout
						initial={{ opacity: 0, y: 8, scale: 0.98 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.15 } }}
						transition={MESSAGE_CENTER_SPRING}
						onClick={() => markRead(notification)}
						className={cn(
							"group relative cursor-pointer rounded-xl border p-3.5 text-left transition-colors",
							notification.read
								? "border-border/50 bg-background hover:bg-accent/20"
								: "border-primary/30 bg-primary/5 hover:bg-primary/10",
						)}
					>
						<button
							type="button"
							onClick={(event) => {
								event.stopPropagation();
								handleDelete(notification);
							}}
							className="absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-colors hover:border-destructive/40 hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
							title={t("notification.delete")}
						>
							<span className="icon-[solar--close-circle-linear] h-3 w-3" />
						</button>

						<div className="flex items-start gap-3">
							<div
								className={cn(
									"relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
									notification.read ? "bg-muted" : "bg-primary/15",
								)}
							>
								<span
									className={cn(
										"icon-[solar--bell-linear] h-4 w-4",
										notification.read ? "text-muted-foreground" : "text-primary",
									)}
								/>
								{!notification.read && (
									<span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-1 ring-popover" />
								)}
							</div>
							<div className="min-w-0 flex-1">
								<p
									className={cn(
										"truncate text-[12px] leading-snug",
										notification.read ? "text-muted-foreground" : "font-semibold text-foreground",
									)}
								>
									{notification.title}
								</p>
								{notification.body && (
									<p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-muted-foreground">
										{notification.body}
									</p>
								)}
								<p className="mt-1.5 text-[10px] text-muted-foreground/50">
									{formatRelativeTime(notification.created_at)}
								</p>
							</div>
						</div>
					</motion.div>
				))}
			</AnimatePresence>
		</div>
	);
}
