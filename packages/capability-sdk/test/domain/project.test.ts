import { describe, expect, it } from "vitest";
import { CAPABILITY_ERROR_CODES, CAPABILITY_PREFIXES } from "../../src/contracts.js";
import { DOMAIN_PROJECT_CAPABILITIES } from "../../src/domain.js";

describe("project domain capabilities", () => {
	it("uses one stable capability id per project operation", () => {
		expect(Object.values(DOMAIN_PROJECT_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}project.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}project.create`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}project.open`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}project.rename`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}project.archive`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}project.unarchive`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}project.remove`,
		]);
	});

	it("validates project inputs and outputs at the contract boundary", () => {
		expect(() => DOMAIN_PROJECT_CAPABILITIES.CREATE.parseInput({ name: "../escape" })).not.toThrow();
		expect(() => DOMAIN_PROJECT_CAPABILITIES.CREATE.parseInput({ name: "" })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
		expect(() => DOMAIN_PROJECT_CAPABILITIES.LIST.parseOutput({ workspacePath: "C:/workspace" })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_OUTPUT }),
		);
	});
});
