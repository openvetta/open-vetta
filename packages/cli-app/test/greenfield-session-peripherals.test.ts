import type { AgentSession } from "@vetta/runtime-core/kernel";
import type { BackgroundCommandService, BackgroundCommandSnapshot } from "@vetta/runtime-tools/coding";
import { describe, expect, it, vi } from "vitest";
import {
	GreenfieldBackgroundWorkController,
	GreenfieldSessionConfigurationState,
} from "../src/greenfield-session-peripherals.js";

describe("Greenfield session peripherals", () => {
	it("shares mutable agent and plugin configuration while binding queue modes to the Kernel session", async () => {
		const setSteeringMode = vi.fn();
		const setFollowUpMode = vi.fn();
		const state = new GreenfieldSessionConfigurationState("work", () => ({
			toolContributions: [],
		}));
		const controller = state.createController({
			setSteeringMode,
			setFollowUpMode,
		} as unknown as AgentSession);

		controller.setSteeringMode("all");
		controller.setFollowUpMode("one-at-a-time");
		controller.setAgentMode("plan");
		await controller.reconfigureAgentPlugins(undefined);

		expect(setSteeringMode).toHaveBeenCalledWith("all");
		expect(setFollowUpMode).toHaveBeenCalledWith("one-at-a-time");
		expect(state.readAgentMode()).toBe("plan");
		expect(state.readAgentPlugins()).toBeUndefined();
	});

	it("projects real background task service commands without sharing mutable snapshots", () => {
		const task: BackgroundCommandSnapshot = {
			id: "b1",
			command: "echo work",
			cwd: "C:/workspace",
			status: "completed",
			outputFile: "C:/workspace/b1.log",
			exitCode: 0,
			startedAt: 1,
			endedAt: 2,
			tail: "work",
		};
		const clearFinished = vi.fn(() => 1);
		const stop = vi.fn(() => true);
		const service = {
			clearFinished,
			stop,
			list: () => [task],
		} as unknown as BackgroundCommandService;
		const controller = new GreenfieldBackgroundWorkController(service);

		const tasks = controller.readTasks();

		expect(tasks).toEqual([task]);
		expect(tasks[0]).not.toBe(task);
		expect(controller.killTask("b1")).toBe(true);
		expect(stop).toHaveBeenCalledWith("b1", "user");
		expect(controller.clearFinished()).toBe(1);
		expect(controller.readSubagents()).toEqual([]);
	});
});
