import { describe, expect, it } from "vitest";
import { CAPABILITY_ERROR_CODES, CAPABILITY_PREFIXES } from "../../src/contracts.js";
import { DOMAIN_SCHEDULER_CAPABILITIES, SCHEDULER_EXECUTION_MODES } from "../../src/domain.js";

describe("scheduler domain capabilities", () => {
	it("uses one stable id per scheduler operation", () => {
		expect(Object.values(DOMAIN_SCHEDULER_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}scheduler.task.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}scheduler.task.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}scheduler.task.history.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}scheduler.task.create`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}scheduler.task.update`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}scheduler.task.delete`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}scheduler.task.set-enabled`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}scheduler.task.run`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}scheduler.task.abort`,
		]);
	});

	it("validates scheduler inputs and preserves explicit optional-field clearing", () => {
		expect(
			DOMAIN_SCHEDULER_CAPABILITIES.CREATE_TASK.parseInput({
				data: {
					name: "Daily",
					prompt: "Run",
					cron: "0 9 * * *",
					isOnce: false,
					enabled: true,
					cwd: "C:/workspace",
					executionMode: SCHEDULER_EXECUTION_MODES.SANDBOX,
				},
			}),
		).toEqual({
			data: {
				name: "Daily",
				prompt: "Run",
				cron: "0 9 * * *",
				isOnce: false,
				enabled: true,
				cwd: "C:/workspace",
				executionMode: SCHEDULER_EXECUTION_MODES.SANDBOX,
			},
		});
		const update = DOMAIN_SCHEDULER_CAPABILITIES.UPDATE_TASK.parseInput({
			taskId: "task",
			data: { modelKey: undefined, skill: undefined },
		});
		expect(update.data).toHaveProperty("modelKey", undefined);
		expect(update.data).toHaveProperty("skill", undefined);
		expect(() => DOMAIN_SCHEDULER_CAPABILITIES.UPDATE_TASK.parseInput({ taskId: "task", data: {} })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
	});
});
