import { describe, expect, it, vi } from "vitest";
import type {
	PluginAiApi,
	PluginAiCompleteRequest,
	PluginAiCompleteResult,
	PluginAiStreamOptions,
} from "@vetta-org/plugin-sdk";
import {
	TASK_REFINEMENT_SYSTEM_PROMPT,
	TaskRefinementService,
} from "../src/task-refinement";

function aiResult(text: string): PluginAiCompleteResult {
	return {
		modelKey: "default",
		text,
		stopReason: "stop",
		usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
	};
}

function fakeAi(
	stream: (
		request: PluginAiCompleteRequest,
		options?: PluginAiStreamOptions,
	) => Promise<PluginAiCompleteResult>,
): PluginAiApi {
	return {
		listModels: async () => ({ defaultModel: null, models: [] }),
		complete: async () => {
			throw new Error("complete is unused");
		},
		stream,
		chat: async () => {
			throw new Error("chat is unused");
		},
	};
}

describe("TaskRefinementService", () => {
	it("aggregates the streamed Markdown brief from the host default model", async () => {
		const brief = [
			"## 背景/目标",
			"",
			"修复登录按钮点击无响应。",
			"",
			"## 验收标准",
			"",
			"- 点击登录后进入首页",
			"",
			"## 实现建议",
			"",
			"检查点击处理函数是否被禁用。",
		].join("\n");
		const stream = vi.fn(async (request: PluginAiCompleteRequest) => {
			expect(request.modelKey).toBeUndefined();
			expect(request.prompt).toBe("登录按钮点了没反应");
			expect(request.systemPrompt).toBe(TASK_REFINEMENT_SYSTEM_PROMPT);
			expect(request.systemPrompt).toContain("背景/目标");
			expect(request.systemPrompt).toContain("验收标准");
			expect(request.systemPrompt).toContain("实现建议");
			expect(request.temperature).toBe(0.3);
			return aiResult(`\n${brief}\n`);
		});
		const service = new TaskRefinementService(fakeAi(stream));

		await expect(service.refine("  登录按钮点了没反应  ")).resolves.toBe(brief);
		expect(stream).toHaveBeenCalledTimes(1);
	});

	it("forwards incremental text snapshots in order", async () => {
		const seen: string[] = [];
		const stream = vi.fn(
			async (_request: PluginAiCompleteRequest, options?: PluginAiStreamOptions) => {
				let text = "";
				for (const delta of ["## 背景", "/目标\n", "修好登录"]) {
					text += delta;
					options?.onTextDelta?.({ delta, text });
				}
				return aiResult(text);
			},
		);
		const service = new TaskRefinementService(fakeAi(stream));

		await expect(
			service.refine("fix login", { onTextDelta: (text) => seen.push(text) }),
		).resolves.toBe("## 背景/目标\n修好登录");
		expect(seen).toEqual(["## 背景", "## 背景/目标\n", "## 背景/目标\n修好登录"]);
	});

	it("throws before calling the model when the draft is empty", async () => {
		const stream = vi.fn(async () => aiResult("unused"));
		const service = new TaskRefinementService(fakeAi(stream));

		await expect(service.refine("   \n\t")).rejects.toThrow("task draft is empty");
		expect(stream).not.toHaveBeenCalled();
	});

	it("throws when the model returns only whitespace", async () => {
		const service = new TaskRefinementService(
			fakeAi(async () => aiResult("  \n\t")),
		);

		await expect(service.refine("fix login")).rejects.toThrow(
			"task refinement returned empty content",
		);
	});

	it("propagates stream failures", async () => {
		const failure = new Error("provider unavailable");
		const service = new TaskRefinementService(
			fakeAi(async () => {
				throw failure;
			}),
		);

		await expect(service.refine("fix login")).rejects.toBe(failure);
	});
});
