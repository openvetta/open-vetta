import { describe, expect, it } from "vitest";
import { CAPABILITY_ERROR_CODES, CAPABILITY_PREFIXES } from "../../src/contracts.js";
import { DOMAIN_IM_CAPABILITIES } from "../../src/domain.js";

describe("IM domain capabilities", () => {
	it("uses one stable id per IM operation", () => {
		expect(Object.values(DOMAIN_IM_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}im.status.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}im.log.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}im.enabled.set`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}im.restart`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}im.agent-model.set`,
		]);
	});

	it("validates status, logs, and model settings", () => {
		const runtime = {
			transport: "online",
			activeSessions: 2,
			consecutiveStartFailures: 0,
		};
		expect(
			DOMAIN_IM_CAPABILITIES.GET_STATUS.parseOutput({
				enabled: true,
				transport: "feishu",
				agentModel: { provider: "openai", model: "gpt-5", reasoningLevel: "high" },
				wechatBound: false,
				feishuAppId: "app-id",
				runtime,
			}),
		).toHaveProperty("runtime.transport", "online");
		expect(
			DOMAIN_IM_CAPABILITIES.LIST_LOGS.parseOutput([
				{ level: "info", msg: "started", time: "2026-07-24T00:00:00.000Z", fields: { pid: 1 } },
			]),
		).toHaveLength(1);
		expect(
			DOMAIN_IM_CAPABILITIES.SET_AGENT_MODEL.parseInput({
				agentModel: { provider: "openai", model: "gpt-5", reasoningLevel: "high" },
			}),
		).toEqual({ agentModel: { provider: "openai", model: "gpt-5", reasoningLevel: "high" } });
		expect(DOMAIN_IM_CAPABILITIES.SET_AGENT_MODEL.parseInput({ agentModel: null })).toEqual({ agentModel: null });
		expect(() => DOMAIN_IM_CAPABILITIES.LIST_LOGS.parseInput({ limit: -1 })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
		expect(() =>
			DOMAIN_IM_CAPABILITIES.SET_AGENT_MODEL.parseInput({ agentModel: { provider: "openai" } }),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }));
	});
});
