import type { AssistantMessage } from "@vetta/ai";
import type { HistoryEntry } from "@vetta/runtime-core";

/** Public Team history may contain text and tool calls, never private reasoning. */
export function publicAssistantMessage(message: AssistantMessage): AssistantMessage {
	return { ...message, content: message.content.filter(isPublicAssistantPart) };
}

export function isPublicAssistantPart(
	part: AssistantMessage["content"][number],
): part is Extract<AssistantMessage["content"][number], { type: "text" | "toolCall" }> {
	return part.type === "text" || part.type === "toolCall";
}

/** Captures the exact private sources while the attempt admission boundary is still available. */
export function publicTeamAttemptResult(
	history: readonly HistoryEntry[],
	previousEntryIds: ReadonlySet<string>,
	terminal: AssistantMessage,
): { readonly assistant: AssistantMessage; readonly sourceMessageEntryIds: readonly string[] } {
	const sources = history.flatMap((entry) =>
		entry.type === "message" &&
		entry.entryId &&
		!previousEntryIds.has(entry.entryId) &&
		entry.message.role === "assistant"
			? [{ id: entry.entryId, message: entry.message }]
			: [],
	);
	return {
		assistant: {
			...publicAssistantMessage(terminal),
			content: sources.flatMap(({ message }) => publicAssistantMessage(message).content),
		},
		sourceMessageEntryIds: sources.map(({ id }) => id),
	};
}

/** Missing sources are not permission to publish a truncated or guessed result. */
export function recoverPublicTeamAttemptResult(
	history: readonly HistoryEntry[],
	sourceMessageEntryId: string,
	sourceMessageEntryIds?: readonly string[],
): AssistantMessage | undefined {
	const sources: AssistantMessage[] = [];
	for (const id of sourceMessageEntryIds ?? [sourceMessageEntryId]) {
		const entry = history.find((candidate) => candidate.type === "message" && candidate.entryId === id);
		if (entry?.type !== "message" || entry.message.role !== "assistant") return undefined;
		sources.push(entry.message);
	}
	const terminal = sources.at(-1);
	return terminal
		? {
				...publicAssistantMessage(terminal),
				content: sources.flatMap((message) => publicAssistantMessage(message).content),
			}
		: undefined;
}
