import { describe, expect, it } from "vitest";
import { CAPABILITY_ERROR_CODES, CAPABILITY_PREFIXES } from "../../src/contracts.js";
import { DOMAIN_AGENT_SETTINGS_CAPABILITIES } from "../../src/domain.js";

describe("agent settings domain capabilities", () => {
	it("uses one stable id per agent settings operation", () => {
		expect(Object.values(DOMAIN_AGENT_SETTINGS_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}agent-settings.experimental.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}agent-settings.experimental.set`,
		]);
	});

	it("validates complete snapshots and non-empty partial updates", () => {
		expect(
			DOMAIN_AGENT_SETTINGS_CAPABILITIES.GET_EXPERIMENTAL.parseOutput({
				vettaCli: true,
				promptPrediction: false,
				agentSkills: true,
			}),
		).toEqual({ vettaCli: true, promptPrediction: false, agentSkills: true });
		expect(DOMAIN_AGENT_SETTINGS_CAPABILITIES.SET_EXPERIMENTAL.parseInput({ promptPrediction: true })).toEqual({
			promptPrediction: true,
		});
		expect(() => DOMAIN_AGENT_SETTINGS_CAPABILITIES.SET_EXPERIMENTAL.parseInput({})).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
		expect(() =>
			DOMAIN_AGENT_SETTINGS_CAPABILITIES.SET_EXPERIMENTAL.parseInput({ promptPrediction: "yes" }),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }));
	});
});
