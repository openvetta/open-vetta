import { describe, expect, it } from "vitest";
import { CAPABILITY_ERROR_CODES, CAPABILITY_PREFIXES } from "../../src/contracts.js";
import { DOMAIN_SKILL_CAPABILITIES, SKILL_TYPES } from "../../src/domain.js";

describe("skill domain capabilities", () => {
	it("uses one stable id per skill operation", () => {
		expect(Object.values(DOMAIN_SKILL_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}skill.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}skill.installed.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}skill.installed.set-enabled`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}skill.installed.uninstall`,
		]);
	});

	it("validates skill queries, installed records, and mutations", () => {
		expect(DOMAIN_SKILL_CAPABILITIES.LIST.parseInput({ cwd: "C:/workspace" })).toEqual({ cwd: "C:/workspace" });
		expect(
			DOMAIN_SKILL_CAPABILITIES.LIST_INSTALLED.parseOutput({
				review: {
					name: "review",
					version: "1.0.0",
					installedAt: "2026-01-01T00:00:00.000Z",
					source: "market",
					enabled: true,
					type: SKILL_TYPES.SKILL,
				},
			}),
		).toHaveProperty("review.enabled", true);
		expect(() => DOMAIN_SKILL_CAPABILITIES.SET_ENABLED.parseInput({ name: "review", enabled: "yes" })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
		expect(() => DOMAIN_SKILL_CAPABILITIES.UNINSTALL.parseInput({ name: "review", type: "other" })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
	});
});
