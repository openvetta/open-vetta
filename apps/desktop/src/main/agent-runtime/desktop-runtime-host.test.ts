import { type PromptRequest, RuntimeHost } from "@vetta/runtime-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopRuntimeHost } from "./desktop-runtime-host.js";

afterEach(() => {
	vi.restoreAllMocks();
});

function decorated(request: PromptRequest): PromptRequest {
	return { ...request, context: [{ type: "decorated", content: "x", modelVisible: true }] };
}

describe("DesktopRuntimeHost", () => {
	it.each([
		["prompt", (host: DesktopRuntimeHost, request: PromptRequest) => host.prompt("s1", request)],
		[
			"promptWhenAvailable",
			(host: DesktopRuntimeHost, request: PromptRequest) => host.promptWhenAvailable("s1", request),
		],
		[
			"queuePromptIfRunning",
			(host: DesktopRuntimeHost, request: PromptRequest) => host.queuePromptIfRunning("s1", request),
		],
	] as const)("decorates %s before handing it to the runtime", async (method, call) => {
		const inner = vi.spyOn(RuntimeHost.prototype, method).mockResolvedValue({ status: "completed" } as never);
		const decoratedFor: Array<[string, PromptRequest]> = [];
		const host = new DesktopRuntimeHost({
			decoratePromptRequest: async (sessionId, request) => {
				decoratedFor.push([sessionId, request]);
				return decorated(request);
			},
		});

		await call(host, { text: "hi" });

		// 装饰器恰好为这个会话、拿原始请求跑了一次，运行时收到的是装饰后的请求。
		expect(decoratedFor).toEqual([["s1", { text: "hi" }]]);
		expect(inner.mock.calls[0]?.[1]).toEqual(decorated({ text: "hi" }));
	});

	it("passes the abort signal through promptWhenAvailable", async () => {
		const inner = vi.spyOn(RuntimeHost.prototype, "promptWhenAvailable").mockResolvedValue({} as never);
		const host = new DesktopRuntimeHost({ decoratePromptRequest: async (_id, request) => request });
		const signal = new AbortController().signal;
		await host.promptWhenAvailable("s1", { text: "hi" }, signal);
		expect(inner.mock.calls[0]?.[2]).toBe(signal);
	});

	it("still sends the original prompt when the decorator throws", async () => {
		const inner = vi.spyOn(RuntimeHost.prototype, "prompt").mockResolvedValue({} as never);
		const host = new DesktopRuntimeHost({
			decoratePromptRequest: async () => {
				throw new Error("boom");
			},
		});
		const request = { text: "hi" };
		await host.prompt("s1", request);
		expect(inner.mock.calls[0]?.[1]).toBe(request);
	});
});
