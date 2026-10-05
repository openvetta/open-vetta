import { type AssistantMessage, createAssistantMessage } from "@vetta/ai";
import type { HistoryEntry } from "@vetta/runtime-core";
import { describe, expect, it } from "vitest";
import { publicTeamAttemptResult, recoverPublicTeamAttemptResult } from "./team-public-message.js";

const base = createAssistantMessage({ api: "openai-responses", provider: "openai", model: "test" });
const first: AssistantMessage = {
	...base,
	content: [
		{ type: "thinking", thinking: "Private reasoning" },
		{ type: "text", text: "First step" },
		{ type: "toolCall", id: "tool", name: "read", arguments: {} },
	],
	stopReason: "toolUse",
};
const final: AssistantMessage = { ...base, content: [{ type: "text", text: "Final result" }], stopReason: "stop" };
const history: HistoryEntry[] = [
	{
		type: "message",
		entryId: "previous-attempt",
		message: { ...base, content: [{ type: "text", text: "Unrelated" }] },
	},
	{ type: "message", entryId: "user", message: { role: "user", content: "Task", timestamp: 1 } },
	{ type: "message", entryId: "first", message: first },
	{ type: "message", entryId: "final", message: final },
];

describe("Team public attempt sources", () => {
	it("retains ordered public text and tool calls, excludes private reasoning and earlier attempts", () => {
		const result = publicTeamAttemptResult(history, new Set(["previous-attempt"]), final);
		expect(result.sourceMessageEntryIds).toEqual(["first", "final"]);
		expect(result.assistant.content).toEqual([...first.content.slice(1), ...final.content]);
		expect(recoverPublicTeamAttemptResult(history, "final", result.sourceMessageEntryIds)).toEqual(result.assistant);
	});
	it("keeps old single-source recovery conservative instead of guessing an attempt range", () => {
		expect(recoverPublicTeamAttemptResult(history, "final")).toEqual(final);
	});
	it("does not recover a missing or non-assistant source", () => {
		expect(recoverPublicTeamAttemptResult(history, "final", ["missing", "final"])).toBeUndefined();
		expect(recoverPublicTeamAttemptResult(history, "final", ["user", "final"])).toBeUndefined();
	});
});
