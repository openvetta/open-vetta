import { describe, expect, it } from "vitest";
import { CAPABILITY_ERROR_CODES, CAPABILITY_PREFIXES } from "../../src/contracts.js";
import { BATCH_EXECUTION_MODES, DOMAIN_BATCH_TASK_CAPABILITIES } from "../../src/domain.js";

describe("batch task domain capabilities", () => {
	it("uses one stable id per batch task operation", () => {
		expect(Object.values(DOMAIN_BATCH_TASK_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.project.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.project.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.project.create`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.project.update`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.project.delete`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.task.run`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.task.retry`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.task.stop`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.task.delete`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.task.resume`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.task.resume-with-text`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.task.session.delete`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.project.task.delete-all`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.project.start`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.project.stop`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.project.reset`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}batch-task.project.failed-task.reset`,
		]);
	});

	it("validates batch project data and preserves skill clearing", () => {
		expect(
			DOMAIN_BATCH_TASK_CAPABILITIES.CREATE_PROJECT.parseInput({
				data: {
					name: "Batch",
					prompt: "Process",
					folders: ["C:/source"],
					concurrency: 2,
					executionMode: BATCH_EXECUTION_MODES.SANDBOX,
				},
			}),
		).toEqual({
			data: {
				name: "Batch",
				prompt: "Process",
				folders: ["C:/source"],
				concurrency: 2,
				executionMode: BATCH_EXECUTION_MODES.SANDBOX,
			},
		});
		const update = DOMAIN_BATCH_TASK_CAPABILITIES.UPDATE_PROJECT.parseInput({
			projectId: "C:/workspace/Batch",
			data: { skill: null },
		});
		expect(update.data).toEqual({ skill: null });
		expect(() =>
			DOMAIN_BATCH_TASK_CAPABILITIES.CREATE_PROJECT.parseInput({
				data: { name: "Batch", prompt: "Process", folders: [], concurrency: 2 },
			}),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }));
	});
});
