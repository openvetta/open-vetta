import { createConversationAgentMessage, createConversationUserMessage } from "@shared/conversation";
import type { Usage } from "@vetta/ai/protocol";
import { describe, expect, it } from "vitest";
import { collectAgentUsages, collectModelSwitchLabels, userModelSwitchFingerprint } from "./message-list-derived";

describe("message-list-derived", () => {
	it("keeps the session usage list while streaming text adds no usage, so rows stay memoized", () => {
		const usage = modelUsage(1, 1);
		const done = createConversationAgentMessage({ id: "a1", text: "done", blocks: [], usages: [usage] });
		const first = collectAgentUsages([done, createConversationAgentMessage({ id: "a2", text: "st", blocks: [] })]);
		const streamed = collectAgentUsages(
			[done, createConversationAgentMessage({ id: "a2", text: "streaming", blocks: [] })],
			first,
		);
		expect(streamed).toBe(first);

		const nextUsage = modelUsage(2, 2);
		const withNewCall = collectAgentUsages(
			[done, createConversationAgentMessage({ id: "a2", text: "streaming", blocks: [], usages: [nextUsage] })],
			first,
		);
		expect(withNewCall).toEqual([usage, nextUsage]);
	});

	it("replaces usage when historical calls change order, disappear, or are corrected", () => {
		const first = modelUsage(1, 2);
		const second = modelUsage(3, 4);
		const previous = [first, second];
		for (const usages of [[second, first], [first], [{ ...first, output: 5 }, second], []]) {
			const next = collectAgentUsages(
				[createConversationAgentMessage({ id: "reply", text: "history", blocks: [], usages })],
				previous,
			);
			expect(next).toEqual(usages);
			expect(next).not.toBe(previous);
		}
	});

	it("keeps the model-switch fingerprint stable while only the assistant tail grows", () => {
		const user = createConversationUserMessage({
			id: "u1",
			text: "hi",
			model: { provider: "openai", id: "gpt-5" },
		});
		const firstTail = createConversationAgentMessage({ id: "a1", text: "hel", blocks: [] });
		const nextTail = createConversationAgentMessage({ id: "a1", text: "hello", blocks: [] });
		const names = new Map([["openai/gpt-5", "GPT-5"]]);

		expect(userModelSwitchFingerprint([user, firstTail])).toBe(userModelSwitchFingerprint([user, nextTail]));
		expect(collectModelSwitchLabels([user, firstTail], names).size).toBe(0);
	});

	it("records a switch banner on the user message that changed models", () => {
		const first = createConversationUserMessage({
			id: "u1",
			text: "a",
			model: { provider: "openai", id: "gpt-4" },
		});
		const second = createConversationUserMessage({
			id: "u2",
			text: "b",
			model: { provider: "openai", id: "gpt-5" },
		});
		const labels = collectModelSwitchLabels([first, second], new Map([["openai/gpt-5", "GPT-5"]]));
		expect(labels.get("u2")).toBe("GPT-5");
	});

	it("collects agent usages in transcript order", () => {
		const usages = collectAgentUsages([
			createConversationUserMessage({ id: "u1", text: "q" }),
			createConversationAgentMessage({
				id: "a1",
				text: "a",
				blocks: [],
				usages: [
					{
						input: 1,
						output: 2,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 3,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					},
				],
			}),
		]);
		expect(usages).toHaveLength(1);
		expect(usages[0]?.output).toBe(2);
	});
});

function modelUsage(input: number, output: number): Usage {
	return {
		input,
		output,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: input + output,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}
