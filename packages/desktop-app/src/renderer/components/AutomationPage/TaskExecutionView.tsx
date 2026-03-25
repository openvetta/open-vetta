import React, { useEffect, useState, useRef } from "react";
import type { ChatMessage, ToolCallBlock } from "../../store/atoms";
import { MessageList } from "../Chat/MessageList";
import type { TaskExecutionRecord } from "../../store/atoms";
import type { TaskMessage, TaskStreamEvent } from "../../../preload/api";
import {
	appendTextDelta,
	appendThinkingDelta,
	clearDraftMessage,
	handleToolStart,
	handleToolEnd,
} from "../../lib/chat-stream";

// ─── Content Types (aligned with pi-ai runtime) ───

interface BaseContent {
	type: string;
}

interface TextContent extends BaseContent {
	type: "text";
	text: string;
}

interface ThinkingContent extends BaseContent {
	type: "thinking";
	thinking: string;
}

interface ToolCallContent extends BaseContent {
	type: "toolCall";
	id: string;
	name: string;
	args: Record<string, unknown>;
}

interface ImageContent extends BaseContent {
	type: "image";
	data: string;
	mimeType: string;
}

type AssistantContentItem = TextContent | ThinkingContent | ToolCallContent;
type AssistantContent = AssistantContentItem[];

type ToolResultContentItem = TextContent | ImageContent;
type ToolResultContent = ToolResultContentItem[];

// ─── Stored Message Types ───

interface BaseMessage {
	role: string;
}

interface StoredUserMessage extends BaseMessage {
	role: "user";
	content: string | BaseContent[];
}

interface StoredAssistantMessage extends BaseMessage {
	role: "assistant";
	content: AssistantContent;
}

interface StoredToolResultMessage extends BaseMessage {
	role: "toolResult";
	toolCallId: string;
	toolName: string;
	content: ToolResultContent;
	isError: boolean;
}

type StoredMessage = StoredUserMessage | StoredAssistantMessage | StoredToolResultMessage;

function isValidContentItem(item: unknown): item is BaseContent {
	return typeof item === "object" && item !== null && typeof (item as { type: unknown }).type === "string";
}

function isContentArray(value: unknown): value is BaseContent[] {
	return Array.isArray(value) && value.every(isValidContentItem);
}

function toStoredMessage(msg: TaskMessage): StoredMessage | null {
	if (msg.role === "user") {
		const content = msg.content;
		if (typeof content === "string" || isContentArray(content)) {
			return { role: "user", content };
		}
		return null;
	}
	if (msg.role === "assistant" && isContentArray(msg.content)) {
		return { role: "assistant", content: msg.content as AssistantContent };
	}
	if (msg.role === "toolResult" && isContentArray(msg.content) && msg.toolCallId && msg.toolName) {
		return {
			role: "toolResult",
			toolCallId: msg.toolCallId,
			toolName: msg.toolName,
			content: msg.content as ToolResultContent,
			isError: msg.isError ?? false,
		};
	}
	return null;
}

function toStoredMessages(messages: TaskMessage[]): StoredMessage[] {
	return messages.map(toStoredMessage).filter((msg): msg is StoredMessage => msg !== null);
}

// ─── Type Guards ───

function isTextContent(item: BaseContent): item is TextContent {
	return item.type === "text";
}

function isThinkingContent(item: BaseContent): item is ThinkingContent {
	return item.type === "thinking";
}

function isToolCallContent(item: BaseContent): item is ToolCallContent {
	return item.type === "toolCall";
}

function isUserMessage(msg: BaseMessage): msg is StoredUserMessage {
	return msg.role === "user";
}

function isAssistantMessage(msg: BaseMessage): msg is StoredAssistantMessage {
	return msg.role === "assistant";
}

function isToolResultMessage(msg: BaseMessage): msg is StoredToolResultMessage {
	return msg.role === "toolResult";
}

interface TaskExecutionViewProps {
	record: TaskExecutionRecord;
	onBack: () => void;
}

// ─── Message Parsing Functions ───

function extractTextFromContent(content: string | BaseContent[]): string {
	if (typeof content === "string") {
		return content;
	}
	return content
		.filter((item): item is TextContent => item.type === "text")
		.map((item) => item.text)
		.join("\n");
}

function extractTextFromToolResult(content: ToolResultContent): string {
	return content
		.filter((item): item is TextContent => item.type === "text")
		.map((item) => item.text)
		.join("\n");
}

interface ParsedToolInfo {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
}

function parseAssistantContent(content: AssistantContent): { text: string; blocks: ChatMessage["blocks"]; toolCalls: ParsedToolInfo[] } {
	const blocks: ChatMessage["blocks"] = [];
	let text = "";
	const toolCalls: ParsedToolInfo[] = [];

	for (const part of content) {
		if (isTextContent(part)) {
			text += part.text;
			blocks.push({ type: "text", text: part.text });
		} else if (isThinkingContent(part)) {
			blocks.push({ type: "thinking", text: part.thinking });
		} else if (isToolCallContent(part)) {
			toolCalls.push({
				toolCallId: part.id,
				toolName: part.name,
				args: part.args ?? {},
			});
		}
	}

	return { text, blocks: blocks.length > 0 ? blocks : undefined, toolCalls };
}

function parseStoredMessages(messages: StoredMessage[]): ChatMessage[] {
	const chatMsgs: ChatMessage[] = [];
	const pendingToolResults = new Map<string, { toolName: string; content: string; isError: boolean }>();

	for (const msg of messages) {
		if (isToolResultMessage(msg)) {
			pendingToolResults.set(msg.toolCallId, {
				toolName: msg.toolName,
				content: extractTextFromToolResult(msg.content),
				isError: msg.isError,
			});
		}
	}

	for (const msg of messages) {
		if (isUserMessage(msg)) {
			chatMsgs.push({
				id: `hist-user-${chatMsgs.length}`,
				role: "user",
				text: extractTextFromContent(msg.content),
			});
		} else if (isAssistantMessage(msg)) {
			const { text, blocks, toolCalls } = parseAssistantContent(msg.content);

			const finalBlocks: ChatMessage["blocks"] = [...(blocks ?? [])];

			for (const tc of toolCalls) {
				const result = pendingToolResults.get(tc.toolCallId);
				const toolCallBlock: ToolCallBlock = result
					? {
							type: "tool_call",
							toolCallId: tc.toolCallId,
							toolName: tc.toolName,
							args: tc.args,
							status: result.isError ? "error" : "success",
							result: result.content,
							isError: result.isError,
						}
					: {
							type: "tool_call",
							toolCallId: tc.toolCallId,
							toolName: tc.toolName,
							args: tc.args,
							status: "pending",
						};
				finalBlocks.push(toolCallBlock);
				pendingToolResults.delete(tc.toolCallId);
			}

			chatMsgs.push({
				id: `hist-asst-${chatMsgs.length}`,
				role: "assistant",
				text,
				blocks: finalBlocks.length > 0 ? finalBlocks : undefined,
			});
		}
	}

	for (const [toolCallId, result] of pendingToolResults) {
		chatMsgs.push({
			id: `hist-tool-result-${toolCallId}`,
			role: "assistant",
			text: "",
			blocks: [
				{
					type: "tool_result",
					toolCallId,
					toolName: result.toolName,
					content: result.content,
					isError: result.isError,
				},
			],
		});
	}

	return chatMsgs;
}

// ─── Component ───

export function TaskExecutionView({ record, onBack }: TaskExecutionViewProps): React.JSX.Element {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
	const [isStreaming, setIsStreaming] = useState(false);
	const [localRecord, setLocalRecord] = useState<TaskExecutionRecord>(record);

	const draftIdRef = useRef<string | null>(null);
	const unsubscribeRef = useRef<(() => void) | null>(null);
	const taskEventRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		setLocalRecord(record);
	}, [record]);

	useEffect(() => {
		taskEventRef.current = window.vetta.scheduler.onTaskEvent((event) => {
			if (event.type === "record.updated") {
				if (event.taskId !== localRecord.taskId || event.sessionId !== localRecord.sessionId) {
					return;
				}
				setLocalRecord((prev) => ({ ...prev, status: event.status }));
				setIsStreaming(false);
			}
		});

		return () => {
			taskEventRef.current?.();
			taskEventRef.current = null;
		};
	}, [localRecord]);

	useEffect(() => {
		let mounted = true;

		const init = async () => {
			setLoading(true);
			setError(null);

			try {
				if (record.status === "running") {
					setChatMessages([]);
					setIsStreaming(true);
					draftIdRef.current = null;

					unsubscribeRef.current = window.vetta.scheduler.onTaskStreamEvent((event: TaskStreamEvent) => {
						if (event.taskId !== record.taskId || event.sessionId !== record.sessionId) {
							return;
						}

						if (event.type === "session.lifecycle") {
							if (event.phase === "agent_start") {
								setChatMessages((prev) => clearDraftMessage(prev, draftIdRef));
							}
							if (event.phase === "agent_end" || event.phase === "aborted") {
								setIsStreaming(false);
								draftIdRef.current = null;
							}
							return;
						}

						if (event.type === "thinking.delta" && event.delta) {
							setChatMessages((prev) => appendThinkingDelta(prev, event.delta!, draftIdRef));
							return;
						}

						if (event.type === "message.delta" && event.delta) {
							setChatMessages((prev) => appendTextDelta(prev, event.delta!, draftIdRef));
							return;
						}

						if (event.type === "toolcall.start" && event.toolCallId && event.toolName) {
							setChatMessages((prev) => handleToolStart(prev, event.toolCallId!, event.toolName!, {}));
							return;
						}

						if (event.type === "tool.start" && event.toolCallId && event.toolName) {
							setChatMessages((prev) =>
								handleToolStart(prev, event.toolCallId!, event.toolName!, event.args ?? {}),
							);
							return;
						}

						if (event.type === "tool.end" && event.toolCallId) {
							setChatMessages((prev) => handleToolEnd(prev, event.toolCallId!, event.result, event.isError ?? false));
							return;
						}
					});
				} else {
					setIsStreaming(false);
					const messages = await window.vetta.scheduler.getRecordMessages(record.taskId, record.sessionId);
					if (!mounted) return;
					if (messages && messages.length > 0) {
						const chatMsgs = parseStoredMessages(toStoredMessages(messages));
						if (mounted) setChatMessages(chatMsgs);
					} else {
						if (mounted) setChatMessages([]);
					}
				}
			} catch (err) {
				if (mounted) setError(String(err));
			} finally {
				if (mounted) setLoading(false);
			}
		};

		init();

		return () => {
			mounted = false;
			unsubscribeRef.current?.();
			unsubscribeRef.current = null;
		};
	}, [record]);
	console.log(draftIdRef.current);
	


	const formatDuration = (ms?: number): string => {
		if (!ms) return "-";
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	};

	const getStatusBadge = (status: TaskExecutionRecord["status"]): React.JSX.Element => {
		const config: Record<TaskExecutionRecord["status"], { class: string; icon: string }> = {
			success: { class: "text-green-500", icon: "icon-[mdi--check-circle]" },
			failed: { class: "text-red-500", icon: "icon-[mdi--close-circle]" },
			running: { class: "text-blue-500 animate-spin", icon: "icon-[mdi--loading]" },
			aborted: { class: "text-yellow-500", icon: "icon-[mdi--cancel]" },
		};
		const { class: cls, icon } = config[status];
		return <span className={`${icon} ${cls} text-sm`} />;
	};

	return (
		<div className="relative flex h-full min-w-0 flex-1 flex-col bg-[var(--content-bg)]">
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
							<span className="text-[14px] font-semibold text-[var(--text-1)]">执行详情</span>
						{getStatusBadge(localRecord.status)}
					</div>
				</div>
				<div className="flex items-center gap-3 text-[11px] text-[var(--text-3)]">
						<span>{new Date(localRecord.startedAt).toLocaleString()}</span>
						<span>{formatDuration(localRecord.durationMs)}</span>
					</div>
				</div>
			</div>

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
				<MessageList messages={chatMessages} isStreaming={isStreaming} />
			)}
		</div>
	);
}
