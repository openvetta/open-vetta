import type { AssistantMessage, Message, ToolResultMessage, Usage } from "@vetta/ai";
import type { HistoryEntry } from "@vetta/runtime-core";
import { parseToolArguments } from "./jsonl.js";

export const EXTERNAL_ORIGIN_MARKER_TYPE = "external_origin";
export const OMITTED_REASONING_MARKER_TYPE = "omitted_reasoning";
export const SKIPPED_TRUNCATED_LINES_MARKER_TYPE = "skipped_truncated_lines";

export const EXTERNAL_SESSION_HISTORY_UNAVAILABLE = {
	corrupted_header: "EXTERNAL_SESSION_CORRUPTED_HEADER",
	unsupported_version: "EXTERNAL_SESSION_UNSUPPORTED_VERSION",
} as const;

const EMPTY_USAGE: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const TARGET_ARGUMENT_KEYS = [
	"command",
	"path",
	"file_path",
	"query",
	"url",
	"uri",
	"pattern",
	"target",
	"input",
] as const;

export interface ExternalBriefingRound {
	readonly user: string;
	readonly assistant: string;
}

export type ExternalConversationEvent =
	| { readonly kind: "user"; readonly text: string }
	| { readonly kind: "assistant"; readonly text: string }
	| { readonly kind: "reasoning" }
	| {
			readonly kind: "tool_call";
			readonly id: string;
			readonly name: string;
			readonly arguments?: unknown;
	  }
	| {
			readonly kind: "tool_result";
			readonly id: string;
			readonly content: string;
			readonly name?: string;
			readonly isError?: boolean;
	  };

interface PendingTool {
	readonly id: string;
	readonly name: string;
	readonly targetKey?: string;
	readonly target: string;
}

export function projectExternalConversationDisplay(input: {
	readonly tool: string;
	readonly events: readonly ExternalConversationEvent[];
	readonly skippedLineCount?: number;
}): HistoryEntry[] {
	const history: HistoryEntry[] = [
		{
			type: "custom_marker",
			customType: EXTERNAL_ORIGIN_MARKER_TYPE,
			details: { tool: input.tool },
			timestamp: "",
		},
	];
	let pendingReasoning = 0;
	const pendingTools = new Map<string, PendingTool>();

	const flushReasoning = (): void => {
		if (pendingReasoning === 0) return;
		history.push({
			type: "custom_marker",
			customType: OMITTED_REASONING_MARKER_TYPE,
			details: { count: pendingReasoning },
			timestamp: "",
		});
		pendingReasoning = 0;
	};

	for (const event of input.events) {
		if (event.kind === "reasoning") {
			pendingReasoning += 1;
			continue;
		}
		if (event.kind === "user") {
			if (!event.text) continue;
			flushReasoning();
			history.push(messageEntry({ role: "user", content: event.text, timestamp: 0 }));
			continue;
		}
		if (event.kind === "assistant") {
			if (!event.text) continue;
			flushReasoning();
			history.push(messageEntry(createExternalAssistantMessage(input.tool, [{ type: "text", text: event.text }])));
			continue;
		}
		if (event.kind === "tool_call") {
			flushReasoning();
			pendingTools.set(event.id, {
				id: event.id,
				name: event.name,
				...readToolTarget(event.arguments),
			});
			continue;
		}
		flushReasoning();
		const pending = pendingTools.get(event.id);
		pendingTools.delete(event.id);
		emitFoldedTool(history, input.tool, {
			id: event.id,
			name: pending?.name ?? event.name ?? "tool",
			targetKey: pending?.targetKey,
			target: pending?.target ?? "",
			isError: event.isError === true || isFailedToolResult(event.content),
		});
	}

	flushReasoning();
	for (const tool of pendingTools.values()) {
		emitFoldedToolCallOnly(history, input.tool, tool);
	}
	if ((input.skippedLineCount ?? 0) > 0) {
		history.push({
			type: "custom_marker",
			customType: SKIPPED_TRUNCATED_LINES_MARKER_TYPE,
			details: { count: input.skippedLineCount },
			timestamp: "",
		});
	}
	return history;
}

export function projectExternalBriefingRounds(events: readonly ExternalConversationEvent[]): ExternalBriefingRound[] {
	const rounds: ExternalBriefingRound[] = [];
	let currentUser = "";
	let assistantParts: string[] = [];

	const flush = (): void => {
		if (!currentUser && assistantParts.length === 0) return;
		rounds.push({ user: currentUser, assistant: assistantParts.join("\n").trim() });
		currentUser = "";
		assistantParts = [];
	};

	for (const event of events) {
		if (event.kind === "user") {
			if (!event.text) continue;
			flush();
			currentUser = event.text;
			continue;
		}
		if (event.kind === "assistant" && event.text) {
			assistantParts.push(event.text);
			continue;
		}
		if (event.kind === "tool_call") {
			const target = readToolTarget(event.arguments);
			const suffix = target.target ? `: ${target.target}` : "";
			assistantParts.push(`[${event.name}${suffix}]`);
		}
	}
	flush();
	return rounds;
}

function readToolTarget(value: unknown): { targetKey?: string; target: string } {
	const args = parseToolArguments(value);
	for (const key of TARGET_ARGUMENT_KEYS) {
		const candidate = args[key];
		if (typeof candidate === "string" && candidate.trim()) {
			return { targetKey: key, target: candidate.trim() };
		}
	}
	return { target: "" };
}

function foldedToolArguments(tool: { readonly targetKey?: string; readonly target: string }): Record<string, string> {
	if (!tool.target) return {};
	return { [tool.targetKey ?? "target"]: tool.target };
}

function emitFoldedToolCallOnly(history: HistoryEntry[], toolId: string, tool: PendingTool): void {
	history.push(
		messageEntry(
			createExternalAssistantMessage(toolId, [
				{
					type: "toolCall",
					id: tool.id,
					name: tool.name,
					arguments: foldedToolArguments(tool),
				},
			]),
		),
	);
}

function emitFoldedTool(
	history: HistoryEntry[],
	toolId: string,
	tool: {
		readonly id: string;
		readonly name: string;
		readonly targetKey?: string;
		readonly target: string;
		readonly isError: boolean;
	},
): void {
	emitFoldedToolCallOnly(history, toolId, tool);
	const result: ToolResultMessage = {
		role: "toolResult",
		toolCallId: tool.id,
		toolName: tool.name,
		content: [],
		isError: tool.isError,
		timestamp: 0,
	};
	history.push(messageEntry(result));
}

function createExternalAssistantMessage(tool: string, content: AssistantMessage["content"]): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "openai-responses",
		provider: "external",
		model: tool,
		usage: EMPTY_USAGE,
		stopReason: "stop",
		timestamp: 0,
	};
}

function messageEntry(message: Message): HistoryEntry {
	return { type: "message", message };
}

function isFailedToolResult(content: string): boolean {
	const exit = /^exit:\s*(-?\d+)/m.exec(content);
	if (exit) return Number(exit[1]) !== 0;
	return /^(error|failed)\b/i.test(content.trim());
}

export function nextGeneratedToolId(index: number): string {
	return `external-tool-${index}`;
}
