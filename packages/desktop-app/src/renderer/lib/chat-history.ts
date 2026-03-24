import type { Message } from "@mariozechner/pi-ai";
import type { ChatMessage, ContentBlock, ToolCallBlock } from "../store/atoms";

function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return (content as Array<{ type: string; text?: string }>)
		.filter((p) => p.type === "text" && typeof p.text === "string")
		.map((p) => p.text!)
		.join("");
}

function messageToBlocks(content: unknown): ContentBlock[] {
	if (typeof content === "string") {
		return content ? [{ type: "text", text: content }] : [];
	}
	if (!Array.isArray(content)) return [];

	const blocks: ContentBlock[] = [];
	for (const part of content as Array<Record<string, unknown>>) {
		if (part.type === "text" && typeof part.text === "string") {
			blocks.push({ type: "text", text: part.text });
		} else if (part.type === "thinking" && typeof part.thinking === "string") {
			blocks.push({ type: "thinking", text: part.thinking });
		} else if (part.type === "toolCall" && typeof part.name === "string") {
			blocks.push({
				type: "tool_call",
				toolCallId: String(part.id ?? ""),
				toolName: String(part.name),
				args: (part.arguments as Record<string, unknown>) ?? {},
				status: "success",
			});
		}
	}
	return blocks;
}

let idCounter = 0;
function nextId(prefix: string): string {
	return `${prefix}-${++idCounter}-${Date.now()}`;
}

interface UserMessage {
	role: "user";
	content: unknown;
}

interface AssistantMessage {
	role: "assistant";
	content: unknown;
}

interface ToolResultMessage {
	role: "toolResult";
	toolCallId: string;
	content: unknown;
	isError?: boolean;
}

export function historyToChat(history: Message[]): ChatMessage[] {
	const messages: ChatMessage[] = [];
	const toolCallIndex = new Map<string, ToolCallBlock>();

	for (const m of history) {
		if (m.role === "user") {
			const userMsg = m as unknown as UserMessage;
			messages.push({
				id: nextId("hist-user"),
				role: "user",
				text: extractText(userMsg.content),
			});
		} else if (m.role === "assistant") {
			const assistantMsg = m as unknown as AssistantMessage;
			const blocks = messageToBlocks(assistantMsg.content);
			for (const b of blocks) {
				if (b.type === "tool_call") {
					toolCallIndex.set(b.toolCallId, b);
				}
			}
			messages.push({
				id: nextId("hist-asst"),
				role: "assistant",
				text: extractText(assistantMsg.content),
				blocks,
			});
		} else if (m.role === "toolResult") {
			const toolResult = m as unknown as ToolResultMessage;
			const block = toolCallIndex.get(toolResult.toolCallId);
			if (block) {
				block.result = extractText(toolResult.content);
				block.isError = toolResult.isError === true;
				block.status = toolResult.isError ? "error" : "success";
			}
		}
	}
	return messages;
}
