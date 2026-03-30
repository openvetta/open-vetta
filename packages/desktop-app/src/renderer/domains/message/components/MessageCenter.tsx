import { useState, useRef, useEffect } from "react";
import { useAtomValue } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { flowingPendingCountAtom, flowingPendingListAtom } from "@shared/store/atoms";
import { Button } from "@shared/components/ui/button";
import { useFlowingReceive } from "@domains/flowing/hooks/useFlowingReceive";
import { cn } from "@shared/lib/utils";

type Tab = "all" | "notifications" | "flowing";

const TABS: { value: Tab; label: string }[] = [
	{ value: "all", label: "全部" },
	{ value: "notifications", label: "通知" },
	{ value: "flowing", label: "流转" },
];

function FlowingList(): JSX.Element {
	const pendingList = useAtomValue(flowingPendingListAtom);
	const { processing, accept, reject } = useFlowingReceive();

	if (pendingList.length === 0) {
		return <EmptyState text="暂无待处理流转" />;
	}

	return (
		<div className="flex flex-col">
			{pendingList.map((t) => (
				<div key={t.id} className="border-b border-border px-3 py-3 last:border-b-0">
					<div className="flex items-start gap-2.5">
						<span className="icon-[mdi--account-circle] mt-0.5 h-7 w-7 shrink-0 text-muted-foreground/60" />
						<div className="min-w-0 flex-1">
							<p className="text-[12px] leading-relaxed">
								<span className="font-semibold text-foreground">{t.sender_name}</span>
								<span className="text-muted-foreground"> 发来了 </span>
								<span className="font-semibold text-foreground">{t.project_name}</span>
							</p>
							{t.message && (
								<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t.message}</p>
							)}
							<p className="mt-1 text-[11px] text-muted-foreground/60">
								{t.file_list.length} 个文件
								<span className="mx-1">·</span>
								{formatRelativeTime(t.created_at)}
							</p>
							<div className="mt-2 flex gap-2">
								<Button
									size="sm"
									variant="outline"
									className="h-6 px-2.5 text-[11px]"
									onClick={() => reject(t)}
									disabled={processing}
								>
									拒绝
								</Button>
								<Button
									size="sm"
									className="h-6 px-2.5 text-[11px]"
									onClick={() => accept(t)}
									disabled={processing}
								>
									{processing ? "处理中..." : "接受"}
								</Button>
							</div>
						</div>
					</div>
				</div>
			))}
		</div>
	);
}

function NotificationList(): JSX.Element {
	return <EmptyState text="暂无通知" />;
}

function EmptyState({ text }: { text: string }): JSX.Element {
	return (
		<div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
			<span className="icon-[mdi--inbox-outline] text-2xl text-muted-foreground/25" />
			<p className="text-[11px] text-muted-foreground/40">{text}</p>
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
	const panelRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const pendingCount = useAtomValue(flowingPendingCountAtom);

	const totalUnread = pendingCount;

	// Close on outside click
	useEffect(() => {
		if (!open) return;
		function handleClick(e: MouseEvent) {
			if (
				panelRef.current &&
				!panelRef.current.contains(e.target as Node) &&
				buttonRef.current &&
				!buttonRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [open]);

	// Close on Escape
	useEffect(() => {
		if (!open) return;
		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") setOpen(false);
		}
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [open]);

	return (
		<div className="relative">
			<AnimatePresence>
				{open && (
					<motion.div
						ref={panelRef}
						initial={{ opacity: 0, y: 4, scale: 0.98 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 4, scale: 0.98 }}
						transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
						className="absolute bottom-full right-0 mb-1.5 w-[320px] overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
					>
						{/* Header */}
						<div className="flex items-center justify-between border-b border-border px-3 py-2.5">
							<span className="text-[12px] font-semibold text-foreground">消息中心</span>
						</div>

						{/* Tabs */}
						<div className="flex gap-0.5 border-b border-border px-3 py-1.5">
							{TABS.map(({ value, label }) => (
								<button
									key={value}
									type="button"
									onClick={() => setActiveTab(value)}
									className={cn(
										"relative rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
										activeTab === value
											? "bg-accent text-foreground"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{label}
									{value === "flowing" && pendingCount > 0 && (
										<span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
											{pendingCount}
										</span>
									)}
								</button>
							))}
						</div>

						{/* Content */}
						<div className="max-h-[360px] overflow-y-auto">
							{activeTab === "all" && (
								<>
									{pendingCount > 0 ? <FlowingList /> : <EmptyState text="暂无消息" />}
								</>
							)}
							{activeTab === "notifications" && <NotificationList />}
							{activeTab === "flowing" && <FlowingList />}
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			<button
				ref={buttonRef}
				type="button"
				onClick={() => setOpen((v) => !v)}
				className={cn(
					"no-drag relative flex items-center justify-center rounded-lg p-[6px] transition-colors",
					open ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
				)}
				title="消息中心"
			>
				<span className="icon-[mdi--bell-outline] h-4 w-4" />
				{totalUnread > 0 && (
					<span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
						{totalUnread}
					</span>
				)}
			</button>
		</div>
	);
}
