import { type ReactNode, useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	authTokenAtom,
	flowingChatSummaryAtom,
	flowingChatTotalUnreadAtom,
	flowingPendingCountAtom,
	flowingPendingListAtom,
	notificationUnreadAtom,
	notificationsAtom,
	projectsAtom,
} from "@shared/store/atoms";
import {
	clearReadNotifications,
	deleteNotification,
	markAllNotificationsRead,
	markNotificationRead,
	type NotificationVO,
} from "@shared/lib/api";
import { Button } from "@shared/components/ui/button";
import { useFlowingReceive } from "@domains/flowing/hooks/useFlowingReceive";
import { cn } from "@shared/lib/utils";

type Tab = "all" | "notifications" | "flowing" | "chat";

const TABS: { value: Tab; label: string; icon: string }[] = [
	{ value: "all", label: "全部", icon: "icon-[solar--inbox-linear]" },
	{ value: "chat", label: "聊天", icon: "icon-[solar--chat-round-line-linear]" },
	{ value: "flowing", label: "流转", icon: "icon-[solar--transfer-horizontal-linear]" },
	{ value: "notifications", label: "通知", icon: "icon-[solar--bell-linear]" },
];

const SPRING = { type: "spring" as const, stiffness: 420, damping: 32 };

function FlowingList(): JSX.Element {
	const pendingList = useAtomValue(flowingPendingListAtom);
	const { processing, accept, reject } = useFlowingReceive();

	if (pendingList.length === 0) {
		return <EmptyState text="暂无待处理流转" icon="icon-[solar--transfer-horizontal-linear]" />;
	}

	return (
		<div className="flex flex-col gap-1.5 p-3">
			<AnimatePresence initial={false}>
				{pendingList.map((t, i) => (
					<motion.div
						key={t.id}
						layout
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0, padding: 0 }}
						transition={{ duration: 0.2, delay: i * 0.03 }}
						className="group rounded-xl border border-border/60 bg-background p-3.5 transition-colors hover:border-primary/40 hover:bg-accent/30"
					>
						<div className="flex items-start gap-3">
							{/* Avatar */}
							<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
								<span className="icon-[solar--user-circle-linear] h-4.5 w-4.5 text-primary" />
							</div>

							<div className="min-w-0 flex-1">
								{/* Title */}
								<p className="text-[12.5px] leading-snug">
									<span className="font-semibold text-foreground">{t.sender_name}</span>
									<span className="text-muted-foreground"> 分享了 </span>
									<span className="font-semibold text-foreground">{t.project_name}</span>
								</p>

								{/* Message */}
								{t.message && (
									<p className="mt-1.5 line-clamp-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
										{t.message}
									</p>
								)}

								{/* Meta */}
								<div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground/50">
									<span className="flex items-center gap-1">
										<span className="icon-[solar--documents-minimalistic-linear] h-3 w-3" />
										{t.file_list.length} 个文件
									</span>
									<span>{formatRelativeTime(t.created_at)}</span>
								</div>

								{/* Actions */}
								<div className="mt-2.5 flex gap-2">
									<Button
										size="sm"
										variant="outline"
										className="h-7 rounded-lg px-3.5 text-[11px] font-medium"
										onClick={() => reject(t)}
										disabled={processing}
									>
										拒绝
									</Button>
									<Button
										size="sm"
										className="h-7 rounded-lg px-3.5 text-[11px] font-medium"
										onClick={() => accept(t)}
										disabled={processing}
									>
										{processing ? "处理中..." : "接受"}
									</Button>
								</div>
							</div>
						</div>
					</motion.div>
				))}
			</AnimatePresence>
		</div>
	);
}

function NotificationList(): JSX.Element {
	const token = useAtomValue(authTokenAtom);
	const notifications = useAtomValue(notificationsAtom);
	const setNotifications = useSetAtom(notificationsAtom);
	const setUnread = useSetAtom(notificationUnreadAtom);

	const hasUnread = notifications.some((n) => !n.read);
	const hasRead = notifications.some((n) => n.read);

	const markRead = (n: NotificationVO): void => {
		if (n.read || !token) return;
		setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
		setUnread((prev) => Math.max(0, prev - 1));
		void markNotificationRead(token, n.id).catch(console.error);
	};

	const handleReadAll = (): void => {
		if (!token) return;
		setNotifications((prev) => prev.map((x) => ({ ...x, read: true })));
		setUnread(0);
		void markAllNotificationsRead(token).catch(console.error);
	};

	const handleDelete = (n: NotificationVO): void => {
		if (!token) return;
		setNotifications((prev) => prev.filter((x) => x.id !== n.id));
		if (!n.read) setUnread((prev) => Math.max(0, prev - 1));
		void deleteNotification(token, n.id).catch(console.error);
	};

	const handleClearRead = (): void => {
		if (!token) return;
		setNotifications((prev) => prev.filter((x) => !x.read));
		void clearReadNotifications(token).catch(console.error);
	};

	if (notifications.length === 0) {
		return <EmptyState text="暂无通知" icon="icon-[solar--bell-linear]" />;
	}

	return (
		<div className="flex flex-col gap-1.5 p-3">
			{(hasUnread || hasRead) && (
				<div className="flex justify-end gap-1.5 px-0.5">
					{hasUnread && (
						<ToolbarButton icon="icon-[solar--check-read-linear]" onClick={handleReadAll}>
							全部已读
						</ToolbarButton>
					)}
					{hasRead && (
						<ToolbarButton icon="icon-[solar--notification-lines-remove-linear]" onClick={handleClearRead}>
							清空已读
						</ToolbarButton>
					)}
				</div>
			)}
			<AnimatePresence initial={false} mode="popLayout">
				{notifications.map((n) => (
					<motion.div
						key={n.id}
						layout
						initial={{ opacity: 0, y: 8, scale: 0.98 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.15 } }}
						transition={SPRING}
						onClick={() => markRead(n)}
						className={cn(
							"group relative cursor-pointer rounded-xl border p-3.5 text-left transition-colors",
							n.read
								? "border-border/50 bg-background hover:bg-accent/20"
								: "border-primary/30 bg-primary/[0.04] hover:bg-primary/[0.07]",
						)}
					>
						{/* Delete (hover, top-right) */}
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								handleDelete(n);
							}}
							className="absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-all hover:border-destructive/40 hover:bg-destructive hover:text-white group-hover:opacity-100"
							title="删除"
						>
							<span className="icon-[solar--close-circle-linear] h-3 w-3" />
						</button>

						<div className="flex items-start gap-3">
							<div
								className={cn(
									"relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
									n.read ? "bg-muted" : "bg-primary/15",
								)}
							>
								<span
									className={cn(
										"icon-[solar--bell-linear] h-4.5 w-4.5",
										n.read ? "text-muted-foreground" : "text-primary",
									)}
								/>
								{!n.read && (
									<span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-popover" />
								)}
							</div>
							<div className="min-w-0 flex-1">
								<p
									className={cn(
										"truncate text-[12.5px] leading-snug",
										n.read ? "text-muted-foreground" : "font-semibold text-foreground",
									)}
								>
									{n.title}
								</p>
								{n.body && (
									<p className="mt-1 whitespace-pre-line text-[11.5px] leading-relaxed text-muted-foreground">
										{n.body}
									</p>
								)}
								<p className="mt-1.5 text-[10px] text-muted-foreground/50">
									{formatRelativeTime(n.created_at)}
								</p>
							</div>
						</div>
					</motion.div>
				))}
			</AnimatePresence>
		</div>
	);
}

function ToolbarButton({
	icon,
	onClick,
	children,
}: {
	icon: string;
	onClick: () => void;
	children: ReactNode;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
		>
			<span className={cn(icon, "h-3.5 w-3.5")} />
			{children}
		</button>
	);
}

function ChatList({ onClose }: { onClose: () => void }): JSX.Element {
	const summaryMap = useAtomValue(flowingChatSummaryAtom);
	const projects = useAtomValue(projectsAtom);
	const navigate = useNavigate();
	const setActivityOpen = useSetAtom(activityPanelOpenAtom);
	const setTabByProject = useSetAtom(activityPanelTabByProjectAtom);

	// 取所有有未读的会话，按最近时间倒序
	const items = useMemo(() => {
		return Array.from(summaryMap.values())
			.filter((s) => s.unread_count > 0)
			.sort((a, b) => {
				const ta = a.last_created_at ? new Date(a.last_created_at).getTime() : 0;
				const tb = b.last_created_at ? new Date(b.last_created_at).getTime() : 0;
				return tb - ta;
			});
	}, [summaryMap]);

	if (items.length === 0) {
		return <EmptyState text="暂无未读聊天" icon="icon-[solar--chat-round-line-linear]" />;
	}

	const cwdByFlowing = new Map<number, string>();
	for (const p of projects) {
		if (p.flowingId != null) cwdByFlowing.set(p.flowingId, p.cwd);
	}

	const handleClick = (flowingId: number) => {
		const cwd = cwdByFlowing.get(flowingId);
		if (!cwd) {
			alert("项目不在当前工作区，无法打开");
			return;
		}
		// 切到聊天 tab + 打开活动面板 + 跳转到项目页
		setTabByProject((prev) => {
			const m = new Map(prev);
			m.set(cwd, "chat");
			return m;
		});
		setActivityOpen(true);
		void navigate({ to: "/project/$cwd", params: { cwd: encodeURIComponent(cwd) } });
		onClose();
	};

	return (
		<div className="flex flex-col gap-1.5 p-3">
			{items.map((s) => (
				<motion.button
					key={s.flowing_id}
					layout
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={SPRING}
					type="button"
					onClick={() => handleClick(s.flowing_id)}
					className="group rounded-xl border border-border/60 bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
				>
					<div className="flex items-start gap-3">
						<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
							<span className="icon-[solar--chat-round-line-linear] h-4 w-4 text-primary" />
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex items-center justify-between gap-2">
								<p className="truncate text-[12.5px] font-semibold text-foreground">
									{s.project_name || `流转 #${s.flowing_id}`}
								</p>
								<span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
									{s.unread_count}
								</span>
							</div>
							<p className="mt-1 truncate text-[11.5px] text-muted-foreground">
								{s.last_sender ? `${s.last_sender}：` : ""}
								{s.last_content || "新消息"}
							</p>
							{s.last_created_at && (
								<p className="mt-1 text-[10px] text-muted-foreground/50">
									{formatRelativeTime(s.last_created_at)}
								</p>
							)}
						</div>
					</div>
				</motion.button>
			))}
		</div>
	);
}

function EmptyState({ text, icon }: { text: string; icon: string }): JSX.Element {
	return (
		<motion.div
			initial={{ opacity: 0, scale: 0.96 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ duration: 0.2 }}
			className="flex flex-col items-center justify-center gap-3 py-14 text-center"
		>
			<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/[0.07]">
				<span className={cn(icon, "h-6 w-6 text-primary/40")} />
			</div>
			<p className="text-[12px] text-muted-foreground/40">{text}</p>
		</motion.div>
	);
}

function formatRelativeTime(dateStr: string): string {
	const diff = Date.now() - new Date(dateStr).getTime();
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "刚刚";
	if (minutes < 60) return `${minutes} 分钟前`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} 小时前`;
	const days = Math.floor(hours / 24);
	return `${days} 天前`;
}

export function MessageCenter(): JSX.Element {
	const [open, setOpen] = useState(false);
	const [activeTab, setActiveTab] = useState<Tab>("all");
	const pendingCount = useAtomValue(flowingPendingCountAtom);
	const chatUnread = useAtomValue(flowingChatTotalUnreadAtom);
	const notifUnread = useAtomValue(notificationUnreadAtom);

	const totalUnread = pendingCount + chatUnread + notifUnread;
	const close = () => setOpen(false);

	return (
		<>
			{/* Trigger button */}
			<button
				type="button"
				onClick={() => setOpen(true)}
				className={cn(
					"no-drag relative flex items-center justify-center rounded-lg p-[6px] transition-all duration-200",
					open
						? "bg-accent text-foreground"
						: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
				)}
				title="消息中心"
			>
				<span
					className={cn(
						"inline-flex h-4 w-4 items-center justify-center",
						totalUnread > 0 && "message-bell-swing",
					)}
				>
					<span className="icon-[solar--bell-linear] h-4 w-4" />
				</span>
				{totalUnread > 0 && (
					<span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground shadow-sm shadow-primary/30">
						{totalUnread}
					</span>
				)}
			</button>

			<DialogPrimitive.Root open={open} onOpenChange={setOpen}>
				<AnimatePresence>
					{open && (
						<DialogPrimitive.Portal forceMount>
							<DialogPrimitive.Overlay asChild forceMount>
								<motion.div
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									transition={{ duration: 0.18 }}
									className="fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-[1px]"
								/>
							</DialogPrimitive.Overlay>

							<DialogPrimitive.Content
								asChild
								forceMount
								aria-describedby={undefined}
								onOpenAutoFocus={(e) => e.preventDefault()}
							>
								<motion.div
									initial={{ opacity: 0, scale: 0.95, y: -10 }}
									animate={{ opacity: 1, scale: 1, y: 0 }}
									exit={{ opacity: 0, scale: 0.96, y: -8, transition: { duration: 0.14 } }}
									transition={SPRING}
									style={{ transformOrigin: "top right" }}
									className="fixed right-3 top-12 z-50 flex max-h-[min(560px,calc(100vh-5rem))] w-[420px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border/70 bg-popover text-popover-foreground shadow-2xl shadow-black/20 outline-none"
								>
									{/* Header */}
									<div className="relative flex items-center justify-between px-5 pt-4 pb-3">
										<div className="flex items-center gap-2">
											<span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/15">
												<span className="icon-[solar--bell-linear] h-3.5 w-3.5 text-primary" />
											</span>
											<DialogPrimitive.Title className="text-[14px] font-semibold tracking-[-0.01em] text-foreground">
												消息中心
											</DialogPrimitive.Title>
										</div>
										<button
											type="button"
											onClick={close}
											className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
										>
											<span className="icon-[solar--close-circle-linear] h-4 w-4" />
										</button>
									</div>

									{/* Tabs (theme-colored, animated pill) */}
									<div className="flex gap-1 px-4 pb-3">
										{TABS.map(({ value, label, icon }) => {
											const isActive = activeTab === value;
											const count =
												value === "flowing"
													? pendingCount
													: value === "chat"
														? chatUnread
														: value === "notifications"
															? notifUnread
															: 0;
											return (
												<button
													key={value}
													type="button"
													onClick={() => setActiveTab(value)}
													className={cn(
														"relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors duration-150",
														isActive
															? "text-primary-foreground"
															: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
													)}
												>
													{isActive && (
														<motion.span
															layoutId="msgTabActive"
															transition={SPRING}
															className="absolute inset-0 -z-0 rounded-lg bg-primary shadow-sm shadow-primary/30"
														/>
													)}
													<span className={cn(icon, "relative z-10 h-3.5 w-3.5")} />
													<span className="relative z-10">{label}</span>
													{count > 0 && (
														<span
															className={cn(
																"relative z-10 ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold",
																isActive
																	? "bg-primary-foreground/25 text-primary-foreground"
																	: "bg-primary text-primary-foreground",
															)}
														>
															{count}
														</span>
													)}
												</button>
											);
										})}
									</div>

									{/* Content */}
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
														{chatUnread > 0 && <ChatList onClose={close} />}
														{pendingCount > 0 && <FlowingList />}
														{notifUnread > 0 && <NotificationList />}
														{chatUnread === 0 && pendingCount === 0 && notifUnread === 0 && (
															<EmptyState text="暂无消息" icon="icon-[solar--inbox-linear]" />
														)}
													</>
												)}
												{activeTab === "chat" && <ChatList onClose={close} />}
												{activeTab === "notifications" && <NotificationList />}
												{activeTab === "flowing" && <FlowingList />}
											</motion.div>
										</AnimatePresence>
									</div>
								</motion.div>
							</DialogPrimitive.Content>
						</DialogPrimitive.Portal>
					)}
				</AnimatePresence>
			</DialogPrimitive.Root>
		</>
	);
}
