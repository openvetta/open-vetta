import { describe, expect, it } from "vitest";
import { pickFallbackAiModelKey } from "./ai-model-resolve.js";

describe("pickFallbackAiModelKey", () => {
	const grok = "grok/grok-4.6";
	const local = "openai/gpt-5";

	it("uses the configured default when that model is credentialed", () => {
		expect(pickFallbackAiModelKey(local, [grok, local])).toBe(local);
	});

	it("uses the first credentialed model when defaultModel is unset", () => {
		expect(pickFallbackAiModelKey(null, [grok, local])).toBe(grok);
		expect(pickFallbackAiModelKey(undefined, [grok, local])).toBe(grok);
		expect(pickFallbackAiModelKey("  ", [grok, local])).toBe(grok);
	});

	it("skips a configured default that is not currently credentialed", () => {
		expect(pickFallbackAiModelKey("vetta-go/stale", [grok, local])).toBe(grok);
	});

	it("returns undefined when no credentialed model exists", () => {
		expect(pickFallbackAiModelKey(local, [])).toBeUndefined();
		expect(pickFallbackAiModelKey(null, [])).toBeUndefined();
	});
});
