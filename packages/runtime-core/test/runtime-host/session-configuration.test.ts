import { describe, expect, it, vi } from "vitest";
import {
	type AgentPluginRuntimeConfig,
	LegacyRuntimeSessionConfigurationController,
	type RuntimeSession,
} from "../../src/index.js";

describe("LegacyRuntimeSessionConfigurationController", () => {
	it("preserves all legacy dynamic configuration commands", async () => {
		const setSteeringMode = vi.fn();
		const setFollowUpMode = vi.fn();
		const reconfigureAgentPlugins = vi.fn(async (_agentPlugins: AgentPluginRuntimeConfig | undefined) => {});
		const setAgentMode = vi.fn();
		const session = {
			setSteeringMode,
			setFollowUpMode,
			reconfigureAgentPlugins,
			setAgentMode,
		} as unknown as RuntimeSession;
		const controller = new LegacyRuntimeSessionConfigurationController(session);
		const pluginConfig: AgentPluginRuntimeConfig = {
			skillPathContributions: [{ pluginId: "plugin-1", paths: ["C:/skills"] }],
		};

		controller.setSteeringMode("all");
		controller.setFollowUpMode("one-at-a-time");
		await controller.reconfigureAgentPlugins(pluginConfig);
		controller.setAgentMode(undefined);

		expect(setSteeringMode).toHaveBeenCalledWith("all");
		expect(setFollowUpMode).toHaveBeenCalledWith("one-at-a-time");
		expect(reconfigureAgentPlugins).toHaveBeenCalledWith(pluginConfig);
		expect(reconfigureAgentPlugins.mock.calls[0]?.[0]).toBe(pluginConfig);
		expect(setAgentMode).toHaveBeenCalledWith(undefined);
	});

	it("propagates a legacy plugin reconfiguration failure unchanged", async () => {
		const failure = new Error("plugin reconfigure failed");
		const session = {
			reconfigureAgentPlugins: vi.fn(async () => {
				throw failure;
			}),
		} as unknown as RuntimeSession;
		const controller = new LegacyRuntimeSessionConfigurationController(session);

		await expect(controller.reconfigureAgentPlugins(undefined)).rejects.toBe(failure);
	});
});
