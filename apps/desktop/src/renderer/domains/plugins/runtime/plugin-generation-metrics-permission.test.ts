// @vitest-environment jsdom

import type { InstalledPlugin } from "@preload/api";
import type { PluginPermission } from "@vetta-org/plugin-sdk";
import { describe, expect, it, vi } from "vitest";

const snapshot = { supported: true, sessionId: "runtime-1", phase: "idle", call: null, turn: null };

vi.mock("../../../router", () => ({ router: { navigate: vi.fn() } }));
vi.mock("./plugin-host-bridge", () => ({
	pluginHostBridge: {
		conversation: {
			getGenerationMetrics: () => snapshot,
			onGenerationMetrics: () => ({ dispose: vi.fn() }),
		},
	},
	registerPluginMediaProviderHandler: vi.fn(),
	registerPluginOcrProviderHandler: vi.fn(),
}));

import { createConversationApi } from "./plugin-host-apis";

function installedPlugin(permissions: PluginPermission[]): InstalledPlugin {
	return {
		id: "speed-meter",
		activeVersion: "1.0.0",
		permissions,
		grantedPermissions: permissions,
	} as unknown as InstalledPlugin;
}

describe("generation metrics permission", () => {
	it("lets a plugin read metrics with only agent.session.metrics", () => {
		const api = createConversationApi(installedPlugin(["agent.session.metrics"]), []);
		expect(api.getGenerationMetrics()).toBe(snapshot);
		expect(() => api.onGenerationMetrics(() => undefined)).not.toThrow();
		// 指标权限不连带读对话内容。
		expect(() => api.on(() => undefined)).toThrow("agent.session.read");
	});

	it("treats agent.session.read as covering metrics", () => {
		const api = createConversationApi(installedPlugin(["agent.session.read"]), []);
		expect(api.getGenerationMetrics()).toBe(snapshot);
	});

	it("refuses plugins with neither permission", () => {
		const api = createConversationApi(installedPlugin([]), []);
		expect(() => api.getGenerationMetrics()).toThrow("agent.session.metrics");
		expect(() => api.onGenerationMetrics(() => undefined)).toThrow("agent.session.metrics");
	});
});
