import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import {
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	flowingChatSummaryAtom,
	flowingChatTotalUnreadAtom,
	flowingPendingCountAtom,
	flowingPendingListAtom,
	projectsAtom,
} from "@shared/store/atoms";
import { Button } from "@shared/components/ui/button";
import { Dialog, DialogContent } from "@shared/components/ui/dialog";
import { useFlowingReceive } from "@domains/flowing/hooks/useFlowingReceive";
import { cn } from "@shared/lib/utils";

type Tab = "all" | "notifications" | "flowing" | "chat";

const TABS: { value: Tab; label: string; icon: string }[] = [
	{ value: "all", label: "全部", icon: "icon-[mdi--inbox-outline]" },
	{ value: "chat", label: "聊天", icon: "icon-[mdi--message-text-outline]" },
	{ value: "flowing", label: "流转", icon: "icon-[mdi--swap-horizontal]" },
	{ value: "notifications", label: "通知", icon: "icon-[mdi--bell-outline]" },
];

function FlowingList(): JSX.Element {
	const pendingList = useAtomValue(flowingPendingListAtom);
	const { processing, accept, reject } = useFlowingReceive();

	if (pendingList.length === 0) {
		return <EmptyState text="暂无待处理流转" icon="icon-[mdi--swap-horizontal]" />;
	}

	return (
		<div className="flex flex-col gap-1.5 p-3">
			<AnimatePresence initial={false}>
				{pendingList.map((t, i) => (
					<motion.div
						key={t.id}
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0, padding: 0 }}
						transition={{ duration: 0.2, delay: i * 0.03 }}
						className="group rounded-xl border border-border/60 bg-background p-3.5 transition-colors hover:border-border hover:bg-accent/30"
					>
						<div className="flex items-start gap-3">
							{/* Avatar */}
							<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
								<span className="icon-[mdi--account] h-4.5 w-4.5 text-primary" />
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
										<span className="icon-[mdi--file-multiple-outline] h-3 w-3" />
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
	return <EmptyState text="暂无通知" icon="icon-[mdi--bell-outline]" />;
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
		return <EmptyState text="暂无未读聊天" icon="icon-[mdi--message-text-outline]" />;
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
				<button
					key={s.flowing_id}
					type="button"
					onClick={() => handleClick(s.flowing_id)}
					className="group rounded-xl border border-border/60 bg-background p-3 text-left transition-colors hover:border-border hover:bg-accent/30"
				>
					<div className="flex items-start gap-3">
						<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
							<span className="icon-[mdi--message-text-outline] h-4 w-4 text-primary" />
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex items-center justify-between gap-2">
								<p className="truncate text-[12.5px] font-semibold text-foreground">
									{s.project_name || `流转 #${s.flowing_id}`}
								</p>
								<span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
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
				</button>
			))}
		</div>
	);
}

function EmptyState({ text, icon }: { text: string; icon: string }): JSX.Element {
	return (
		<div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
			<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
				<span className={cn(icon, "h-6 w-6 text-muted-foreground/30")} />
			</div>
			<p className="text-[12px] text-muted-foreground/40">{text}</p>
		</div>
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

	const totalUnread = pendingCount + chatUnread;

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
					<span className="icon-[mdi--bell-outline] h-4 w-4" />
				</span>
				{totalUnread > 0 && (
					<span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white shadow-sm shadow-red-500/30">
						{totalUnread}
					</span>
				)}
			</button>

			{/* Dialog */}
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent
					className="flex max-h-[520px] w-[420px] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[420px]"
					showCloseButton={false}
				>
					{/* Header */}
					<div className="flex items-center justify-between px-5 pb-0 pt-5">
						<h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
							消息中心
						</h2>
						<button
							type="button"
							onClick={() => setOpen(false)}
							className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
						>
							<span className="icon-[mdi--close] h-4 w-4" />
						</button>
					</div>

					{/* Tabs */}
					<div className="flex gap-1 px-5 pb-1 pt-4">
						{TABS.map(({ value, label, icon }) => {
							const isActive = activeTab === value;
							const count =
								value === "flowing" ? pendingCount : value === "chat" ? chatUnread : 0;
							return (
								<button
									key={value}
									type="button"
									onClick={() => setActiveTab(value)}
									className={cn(
										"relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all duration-150",
										isActive
											? "bg-foreground text-background shadow-sm"
											: "text-muted-foreground hover:bg-accent hover:text-foreground",
									)}
								>
									<span className={cn(icon, "h-3.5 w-3.5")} />
									{label}
									{count > 0 && (
										<span
											className={cn(
												"ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold",
												isActive
													? "bg-background/20 text-background"
													: "bg-red-500 text-white",
											)}
										>
											{count}
										</span>
									)}
								</button>
							);
						})}
					</div>

					{/* Divider */}
					<div className="mx-5 mt-2 border-t border-border/60" />

					{/* Content */}
					<div className="flex-1 overflow-y-auto">
						{activeTab === "all" && (
							<>
								{chatUnread > 0 && <ChatList onClose={() => setOpen(false)} />}
								{pendingCount > 0 && <FlowingList />}
								{chatUnread === 0 && pendingCount === 0 && (
									<EmptyState text="暂无消息" icon="icon-[mdi--inbox-outline]" />
								)}
							</>
						)}
						{activeTab === "chat" && <ChatList onClose={() => setOpen(false)} />}
						{activeTab === "notifications" && <NotificationList />}
						{activeTab === "flowing" && <FlowingList />}
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
