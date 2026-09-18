import type { AssistantMessage, Message, ToolResultMessage, Usage } from "@vetta/ai";
import type { HistoryEntry } from "@vetta/runtime-core";
import { GROK_TOOL_ID } from "./grok-summary.js";

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

interface PendingTool {
	readonly id: string;
	readonly name: string;
	readonly targetKey?: string;
	readonly target: string;
}

export interface GrokBriefingRound {
	readonly user: string;
	readonly assistant: string;
}

/** Model-context rounds: user + following assistant text/tool names, without full tool output. */
export function projectGrokConversationBriefingRounds(body: string): GrokBriefingRound[] {
	const parsed = parseJsonlRecords(body);
	const restrictToPromptIndex = parsed.records.some((record) => readNumber(record.prompt_index) !== undefined);
	const rounds: GrokBriefingRound[] = [];
	let currentUser = "";
	let assistantParts: string[] = [];

	const flush = (): void => {
		if (!currentUser && assistantParts.length === 0) return;
		rounds.push({ user: currentUser, assistant: assistantParts.join("\n").trim() });
		currentUser = "";
		assistantParts = [];
	};

	for (const record of parsed.records) {
		const kind = readRecordKind(record);
		if (kind === "reasoning" || kind === "system") continue;
		if (kind === "user") {
			if (isSyntheticUser(record)) continue;
			if (restrictToPromptIndex && readNumber(record.prompt_index) === undefined) continue;
			const text = unwrapUserQuery(readUserText(record));
			if (!text) continue;
			flush();
			currentUser = text;
			continue;
		}
		if (kind === "assistant") {
			const text = readAssistantText(record);
			if (text) assistantParts.push(text);
			for (const tool of readToolCalls(record)) {
				const target = tool.target ? `: ${tool.target}` : "";
				assistantParts.push(`[${tool.name}${target}]`);
			}
		}
	}
	flush();
	return rounds;
}

/** Display-only Grok JSONL projection. Thinking is counted, tools are folded, nothing is written back. */
export function projectGrokConversationDisplay(body: string): HistoryEntry[] {
	const parsed = parseJsonlRecords(body);
	const history: HistoryEntry[] = [
		{
			type: "custom_marker",
			customType: EXTERNAL_ORIGIN_MARKER_TYPE,
			details: { tool: GROK_TOOL_ID },
			timestamp: "",
		},
	];
	const restrictToPromptIndex = parsed.records.some((record) => readNumber(record.prompt_index) !== undefined);
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

	for (const record of parsed.records) {
		const kind = readRecordKind(record);
		if (kind === "reasoning" || hasNestedReasoning(record)) {
			if (kind === "reasoning") {
				pendingReasoning += 1;
				continue;
			}
			pendingReasoning += 1;
		}
		if (kind === "reasoning") continue;
		if (kind === "system") continue;
		if (kind === "user") {
			if (isSyntheticUser(record)) continue;
			if (restrictToPromptIndex && readNumber(record.prompt_index) === undefined) continue;
			const text = unwrapUserQuery(readUserText(record));
			if (!text) continue;
			flushReasoning();
			history.push(messageEntry({ role: "user", content: text, timestamp: 0 }));
			continue;
		}
		if (kind === "assistant") {
			flushReasoning();
			const text = readAssistantText(record);
			if (text) {
				history.push(messageEntry(createAssistantMessage([{ type: "text", text }])));
			}
			for (const tool of readToolCalls(record)) {
				pendingTools.set(tool.id, tool);
			}
			continue;
		}
		if (kind === "tool_result") {
			flushReasoning();
			const toolCallId = readNonEmptyString(record.tool_call_id) ?? readNonEmptyString(record.toolCallId);
			if (!toolCallId) continue;
			const pending = pendingTools.get(toolCallId);
			pendingTools.delete(toolCallId);
			const content = typeof record.content === "string" ? record.content : "";
			emitFoldedTool(history, {
				id: toolCallId,
				name: pending?.name ?? readNonEmptyString(record.name) ?? "tool",
				targetKey: pending?.targetKey,
				target: pending?.target ?? "",
				isError: isFailedToolResult(content),
			});
		}
	}

	flushReasoning();
	for (const tool of pendingTools.values()) {
		emitFoldedToolCallOnly(history, tool);
	}
	if (parsed.skippedLineCount > 0) {
		history.push({
			type: "custom_marker",
			customType: SKIPPED_TRUNCATED_LINES_MARKER_TYPE,
			details: { count: parsed.skippedLineCount },
			timestamp: "",
		});
	}
	return history;
}

function foldedToolArguments(tool: { readonly targetKey?: string; readonly target: string }): Record<string, string> {
	if (!tool.target) return {};
	return { [tool.targetKey ?? "target"]: tool.target };
}

function emitFoldedToolCallOnly(history: HistoryEntry[], tool: PendingTool): void {
	history.push(
		messageEntry(
			createAssistantMessage([
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
	tool: {
		readonly id: string;
		readonly name: string;
		readonly targetKey?: string;
		readonly target: string;
		readonly isError: boolean;
	},
): void {
	emitFoldedToolCallOnly(history, tool);
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

function parseJsonlRecords(body: string): { records: readonly Record<string, unknown>[]; skippedLineCount: number } {
	const records: Record<string, unknown>[] = [];
	let skippedLineCount = 0;
	for (const line of body.split(/\r?\n/)) {
		if (!line.trim()) continue;
		try {
			const value: unknown = JSON.parse(line);
			if (typeof value === "object" && value !== null && !Array.isArray(value)) {
				records.push(value as Record<string, unknown>);
			} else {
				skippedLineCount += 1;
			}
		} catch {
			skippedLineCount += 1;
		}
	}
	return { records, skippedLineCount };
}

function readRecordKind(record: Record<string, unknown>): string {
	return readNonEmptyString(record.type) ?? readNonEmptyString(record.role) ?? "";
}

function hasNestedReasoning(record: Record<string, unknown>): boolean {
	return record.reasoning !== undefined && record.reasoning !== null;
}

function isSyntheticUser(record: Record<string, unknown>): boolean {
	return readNonEmptyString(record.synthetic_reason) !== undefined;
}

function readUserText(record: Record<string, unknown>): string {
	if (typeof record.content === "string") return record.content;
	if (!Array.isArray(record.content)) return "";
	return record.content
		.flatMap((part) => {
			if (typeof part !== "object" || part === null) return [];
			const text = Reflect.get(part, "text");
			return typeof text === "string" ? [text] : [];
		})
		.join("");
}

function unwrapUserQuery(text: string): string {
	const match = /<user_query>\s*([\s\S]*?)\s*<\/user_query>/.exec(text);
	return (match?.[1] ?? text).trim();
}

function readAssistantText(record: Record<string, unknown>): string {
	return typeof record.content === "string" ? record.content.trim() : "";
}

function readToolCalls(record: Record<string, unknown>): PendingTool[] {
	if (!Array.isArray(record.tool_calls)) return [];
	const tools: PendingTool[] = [];
	for (const raw of record.tool_calls) {
		if (typeof raw !== "object" || raw === null) continue;
		const call = raw as Record<string, unknown>;
		const id = readNonEmptyString(call.id);
		const name = readNonEmptyString(call.name);
		if (!id || !name) continue;
		tools.push({ id, name, ...readToolTarget(call.arguments) });
	}
	return tools;
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

function parseToolArguments(value: unknown): Record<string, unknown> {
	if (typeof value === "string") {
		try {
			const parsed: unknown = JSON.parse(value);
			return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
				? (parsed as Record<string, unknown>)
				: {};
		} catch {
			return {};
		}
	}
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return {};
}

function isFailedToolResult(content: string): boolean {
	const exit = /^exit:\s*(-?\d+)/m.exec(content);
	if (exit) return Number(exit[1]) !== 0;
	return /^(error|failed)\b/i.test(content.trim());
}

function createAssistantMessage(content: AssistantMessage["content"]): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "openai-responses",
		provider: "xai",
		model: "grok",
		usage: EMPTY_USAGE,
		stopReason: "stop",
		timestamp: 0,
	};
}

function messageEntry(message: Message): HistoryEntry {
	return { type: "message", message };
}

function readNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
