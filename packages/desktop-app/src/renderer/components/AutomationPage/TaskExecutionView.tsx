import { useEffect, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { chatMessagesAtom, activeSessionAtom, isStreamingAtom } from "../../store/atoms";
import { MessageList } from "../Chat/MessageList";
import { historyToChat } from "../../lib/chat-history";
import type { TaskExecutionRecord } from "../../store/atoms";

interface TaskExecutionViewProps {
	record: TaskExecutionRecord;
	onBack: () => void;
}

export function TaskExecutionView({ record, onBack }: TaskExecutionViewProps): JSX.Element {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const chatMessages = useAtomValue(chatMessagesAtom);
	const setChatMessages = useSetAtom(chatMessagesAtom);
	const setActiveSession = useSetAtom(activeSessionAtom);
	const setIsStreaming = useSetAtom(isStreamingAtom);

	useEffect(() => {
		loadMessages();
		return () => {
			setChatMessages([]);
			setActiveSession(null);
		};
	}, [record.id]);

	const loadMessages = async () => {
		setLoading(true);
		setError(null);
		try {
			const messages = await window.vetta.scheduler.getRecordMessages(record.taskId, record.sessionId);
			if (messages && messages.length > 0) {
				const chatMsgs = historyToChat(messages as Parameters<typeof historyToChat>[0]);
				setChatMessages(chatMsgs);
			} else {
				setChatMessages([]);
			}
			setActiveSession(null);
			setIsStreaming(false);
		} catch (err) {
			setError(String(err));
		} finally {
			setLoading(false);
		}
	};

	const formatDuration = (ms?: number): string => {
		if (!ms) return "-";
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	};

	const getStatusBadge = (status: TaskExecutionRecord["status"]): JSX.Element => {
		const config: Record<TaskExecutionRecord["status"], { class: string; icon: string }> = {
			success: { class: "text-green-500", icon: "mdi--check-circle" },
			failed: { class: "text-red-500", icon: "mdi--close-circle" },
			running: { class: "text-blue-500 animate-pulse", icon: "mdi--loading" },
			aborted: { class: "text-yellow-500", icon: "mdi--cancel" },
		};
		const { class: cls, icon } = config[status];
		return <span className={`icon-[${icon}] ${cls} text-sm`} />;
	};

	return (
		<div className="relative flex h-full min-w-0 flex-1 flex-col bg-[var(--content-bg)]">
			{/* Header */}
			<div
				className="drag-region pointer-events-none absolute inset-x-0 top-0 z-10"
				style={{
					background: "linear-gradient(to bottom, var(--content-bg) 40%, transparent 100%)",
					paddingTop: 20,
					paddingBottom: 20,
					paddingLeft: 16,
					paddingRight: 16,
				}}
			>
				<div className="pointer-events-auto no-drag flex items-center justify-between">
					<div className="flex items-center gap-2">
						<button
							onClick={onBack}
							className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-[var(--hover-strong)]"
						>
							<span className="icon-[mdi--arrow-left] text-[14px]" />
						</button>
						<div className="flex items-center gap-2">
							<span className="text-[14px] font-semibold text-[var(--text-1)]">
								执行详情
							</span>
							{getStatusBadge(record.status)}
						</div>
					</div>
					<div className="flex items-center gap-3 text-[11px] text-[var(--text-3)]">
						<span>{new Date(record.startedAt).toLocaleString()}</span>
						<span>{formatDuration(record.durationMs)}</span>
					</div>
				</div>
			</div>

			{/* Content */}
			{loading ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-3">
					<span className="icon-[mdi--loading] animate-spin text-2xl text-[var(--text-3)]" />
					<p className="text-[13px] text-[var(--text-3)]">加载中...</p>
				</div>
			) : error ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-3">
					<span className="icon-[mdi--alert-circle] text-2xl text-red-500" />
					<p className="text-[13px] text-red-500">{error}</p>
				</div>
			) : chatMessages.length === 0 ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-3">
					<span className="icon-[mdi--chat-outline] text-2xl text-[var(--text-3)]" />
					<p className="text-[13px] text-[var(--text-3)]">暂无消息</p>
				</div>
			) : (
				<MessageList messages={chatMessages} isStreaming={false} />
			)}
		</div>
	);
}
