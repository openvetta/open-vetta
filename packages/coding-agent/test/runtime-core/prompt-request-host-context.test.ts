import type { SessionContextRecord } from "@vetta/runtime-core/kernel";
import { describe, expect, it } from "vitest";
import { CodingAgentPromptRequestAdapter } from "../../src/adapters/runtime-core/prompt-request-adapter.js";
import { preparePrompt } from "./prompt-adapter-test-fixture.js";

// 宿主按变化追加的产品上下文（如同空间兄弟项目，ADR-0159）依赖这条合同：随 PromptRequest
// 传入的 context 原样进入本轮输入，空闲直发与排队路径一致，并排在其他准备阶段上下文之前。
const HOST_CONTEXT: SessionContextRecord = {
	type: "space_sibling_projects",
	content: [{ type: "text", text: "<workspace_sibling_projects>…</workspace_sibling_projects>" }],
	modelVisible: true,
	display: false,
	metadata: { projects: [{ name: "docs", path: "/work/docs" }] },
};

describe("CodingAgentPromptRequestAdapter host-supplied context", () => {
	it.each([
		{ name: "idle", queueing: false, streamingBehavior: undefined },
		{ name: "queued follow-up", queueing: true, streamingBehavior: "followUp" as const },
		{ name: "queued steer", queueing: true, streamingBehavior: "steer" as const },
	])("keeps caller context verbatim for $name prompts", async ({ queueing, streamingBehavior }) => {
		const adapter = new CodingAgentPromptRequestAdapter({ now: () => 7 });
		const prepared = await preparePrompt(
			adapter,
			{ text: "hello", context: [HOST_CONTEXT], ...(streamingBehavior ? { streamingBehavior } : {}) },
			{ sessionId: "session-1", queueing },
		);
		expect(prepared.input.context?.[0]).toEqual(HOST_CONTEXT);
		expect(prepared.input.message).toMatchObject({ role: "user", content: [{ type: "text", text: "hello" }] });
	});

	it("puts caller context before attachment context", async () => {
		const adapter = new CodingAgentPromptRequestAdapter();
		const prepared = await preparePrompt(
			adapter,
			{
				text: "hello",
				context: [HOST_CONTEXT],
				attachments: [{ kind: "file", path: "/work/docs/a.md" }],
			},
			{ sessionId: "session-1", queueing: false },
		);
		expect(prepared.input.context?.map(({ type }) => type)[0]).toBe("space_sibling_projects");
		expect(prepared.input.context?.length).toBeGreaterThan(1);
	});
});
