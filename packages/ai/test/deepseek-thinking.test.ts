import { describe, expect, it, vi } from "vitest";
import { stream, streamSimple } from "../src/stream.js";
import type { Model, SimpleStreamOptions } from "../src/types.js";

const mockState = vi.hoisted(() => ({ lastParams: undefined as unknown }));

vi.mock("openai", () => {
	class FakeOpenAI {
		chat = {
			completions: {
				create: async (params: unknown) => {
					mockState.lastParams = params;
					return {
						async *[Symbol.asyncIterator]() {
							yield {
								choices: [{ delta: {}, finish_reason: "stop" }],
								usage: {
									prompt_tokens: 1,
									completion_tokens: 1,
									prompt_tokens_details: { cached_tokens: 0 },
									completion_tokens_details: { reasoning_tokens: 0 },
								},
							};
						},
					};
				},
			},
		};
	}

	return { default: FakeOpenAI };
});

function deepseekModel(): Model<"openai-completions-deepseek"> {
	return {
		id: "deepseek-v4-flash",
		name: "deepseek-v4-flash",
		api: "openai-completions-deepseek",
		provider: "deepseek",
		baseUrl: "https://api.deepseek.com",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1_000_000,
		maxTokens: 8192,
	};
}

async function capture(model: Model<"openai-completions-deepseek">, reasoning?: string): Promise<any> {
	let payload: unknown;
	await streamSimple(model, { messages: [{ role: "user", content: "hi", timestamp: Date.now() }] }, {
		apiKey: "test",
		reasoning,
		onPayload: (params: unknown) => {
			payload = params;
		},
	} as SimpleStreamOptions).result();
	return (payload ?? mockState.lastParams) as any;
}

async function captureDirect(model: Model<"openai-completions-deepseek">, reasoning?: string): Promise<any> {
	let payload: unknown;
	await stream(
		model,
		{ messages: [{ role: "user", content: "hi", timestamp: Date.now() }] },
		{
			apiKey: "test",
			reasoning,
			onPayload: (params: unknown) => {
				payload = params;
			},
		},
	).result();
	return (payload ?? mockState.lastParams) as any;
}

describe("openai-completions-deepseek thinking", () => {
	it("enables thinking with reasoning_effort passthrough", async () => {
		const params = await capture(deepseekModel(), "high");
		expect(params.thinking).toEqual({ type: "enabled", reasoning_effort: "high" });
		// DeepSeek uses the thinking object, not the top-level reasoning_effort field.
		expect(params.reasoning_effort).toBeUndefined();
	});

	it("passes the configured effort verbatim (no clamping)", async () => {
		const params = await capture(deepseekModel(), "max");
		expect(params.thinking).toEqual({ type: "enabled", reasoning_effort: "max" });
	});

	it("disables thinking when no reasoning is requested", async () => {
		const params = await capture(deepseekModel(), undefined);
		expect(params.thinking).toEqual({ type: "disabled" });
	});

	it("treats reasoning none as disabled", async () => {
		const params = await capture(deepseekModel(), "none");
		expect(params.thinking).toEqual({ type: "disabled" });
		expect(params.reasoning_effort).toBeUndefined();
	});

	it("treats reasoning off as disabled", async () => {
		const params = await capture(deepseekModel(), "off");
		expect(params.thinking).toEqual({ type: "disabled" });
		expect(params.reasoning_effort).toBeUndefined();
	});

	it("treats direct stream reasoning none as disabled", async () => {
		const params = await captureDirect(deepseekModel(), "none");
		expect(params.thinking).toEqual({ type: "disabled" });
		expect(params.reasoning_effort).toBeUndefined();
	});

	it("passes direct stream reasoning effort through", async () => {
		const params = await captureDirect(deepseekModel(), "high");
		expect(params.thinking).toEqual({ type: "enabled", reasoning_effort: "high" });
		expect(params.reasoning_effort).toBeUndefined();
	});
});

describe("openai-completions reasoning passthrough", () => {
	function openaiModel(): Model<"openai-completions"> {
		return {
			id: "gpt-5.2",
			name: "gpt-5.2",
			api: "openai-completions",
			provider: "openai",
			baseUrl: "https://api.openai.com/v1",
			reasoning: true,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 400_000,
			maxTokens: 8192,
		};
	}

	async function captureOpenAI(model: Model<"openai-completions">, reasoning?: string): Promise<any> {
		let payload: unknown;
		await streamSimple(model, { messages: [{ role: "user", content: "hi", timestamp: Date.now() }] }, {
			apiKey: "test",
			reasoning,
			onPayload: (params: unknown) => {
				payload = params;
			},
		} as SimpleStreamOptions).result();
		return (payload ?? mockState.lastParams) as any;
	}

	it("passes xhigh through unchanged on official OpenAI endpoints (no clamp)", async () => {
		const params = await captureOpenAI(openaiModel(), "xhigh");
		expect(params.reasoning_effort).toBe("xhigh");
	});

	it("keeps minimal on official OpenAI endpoints", async () => {
		const params = await captureOpenAI(openaiModel(), "minimal");
		expect(params.reasoning_effort).toBe("minimal");
	});

	it("sends reasoning_effort:none on off for official OpenAI (gpt-5 disable)", async () => {
		const params = await captureOpenAI(openaiModel(), undefined);
		expect(params.reasoning_effort).toBe("none");
	});

	// A DeepSeek endpoint registered on the plain openai-completions api (e.g. added via admin
	// instead of the built-in openai-completions-deepseek). detectCompat must still route it
	// through the deepseek thinking format so "off" disables thinking.
	function genericDeepseekModel(): Model<"openai-completions"> {
		return {
			id: "deepseek-v4-pro",
			name: "deepseek-v4-pro",
			api: "openai-completions",
			provider: "deepseek",
			baseUrl: "https://api.deepseek.com/v1",
			reasoning: true,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 128_000,
			maxTokens: 8192,
		};
	}

	it("disables thinking on off for a DeepSeek endpoint on the plain openai-completions api", async () => {
		const params = await captureOpenAI(genericDeepseekModel(), undefined);
		// DeepSeek defaults to thinking ENABLED; omitting the field is not enough — off must
		// explicitly send thinking:{type:"disabled"}.
		expect(params.thinking).toEqual({ type: "disabled" });
		expect(params.reasoning_effort).toBeUndefined();
	});

	it("enables thinking with reasoning_effort on a plain-api DeepSeek endpoint", async () => {
		const params = await captureOpenAI(genericDeepseekModel(), "high");
		expect(params.thinking).toEqual({ type: "enabled", reasoning_effort: "high" });
	});

	// A generic non-DeepSeek reasoning endpoint (self-hosted vLLM/gateway): "none" is unsupported,
	// so off must omit reasoning_effort rather than send "none".
	function genericVllmModel(): Model<"openai-completions"> {
		return {
			id: "custom-reasoner",
			name: "custom-reasoner",
			api: "openai-completions",
			provider: "custom",
			baseUrl: "https://my-vllm.example.com/v1",
			reasoning: true,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 128_000,
			maxTokens: 8192,
		};
	}

	it("omits reasoning_effort on off for a generic non-OpenAI reasoning endpoint (none unsupported)", async () => {
		const params = await captureOpenAI(genericVllmModel(), undefined);
		expect(params.reasoning_effort).toBeUndefined();
		expect(params.thinking).toBeUndefined();
	});
});
