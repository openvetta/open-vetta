import { describe, expect, it } from "vitest";
import { UNSUPPORTED_GENERATION_METRICS } from "../src/generation-metrics.js";
import { __setPluginHostBridge, type PluginHostBridge, useGenerationMetrics } from "../src/index.js";

function bridge(overrides: Partial<PluginHostBridge>): PluginHostBridge {
	return overrides as PluginHostBridge;
}

describe("useGenerationMetrics", () => {
	it("falls back to an unsupported snapshot when the bridge does not implement metrics", () => {
		__setPluginHostBridge(bridge({}));
		expect(useGenerationMetrics()).toBe(UNSUPPORTED_GENERATION_METRICS);
		expect(UNSUPPORTED_GENERATION_METRICS).toMatchObject({ supported: false, call: null, turn: null });
	});

	it("reads the host's metrics when the host provides them", () => {
		const snapshot = { ...UNSUPPORTED_GENERATION_METRICS, supported: true, sessionId: "runtime-1" };
		__setPluginHostBridge(bridge({ useGenerationMetrics: () => snapshot }));
		expect(useGenerationMetrics()).toBe(snapshot);
	});
});
