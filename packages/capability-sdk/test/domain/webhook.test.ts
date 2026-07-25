import { describe, expect, it } from "vitest";
import { CAPABILITY_ERROR_CODES, CAPABILITY_PREFIXES } from "../../src/contracts.js";
import { DOMAIN_WEBHOOK_CAPABILITIES, WEBHOOK_KINDS } from "../../src/domain.js";

describe("webhook domain capabilities", () => {
	it("uses one stable id per webhook operation", () => {
		expect(Object.values(DOMAIN_WEBHOOK_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}webhook.endpoint.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}webhook.provider.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}webhook.endpoint.create`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}webhook.endpoint.update`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}webhook.endpoint.delete`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}webhook.endpoint.set-enabled`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}webhook.endpoint.test`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}webhook.endpoint.send`,
		]);
	});

	it("validates webhook input and preserves an explicit secret clear", () => {
		expect(
			DOMAIN_WEBHOOK_CAPABILITIES.CREATE_ENDPOINT.parseInput({
				data: {
					kind: WEBHOOK_KINDS.FEISHU,
					name: "",
					webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
				},
			}),
		).toEqual({
			data: {
				kind: WEBHOOK_KINDS.FEISHU,
				name: "",
				webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
			},
		});
		const update = DOMAIN_WEBHOOK_CAPABILITIES.UPDATE_ENDPOINT.parseInput({
			id: "endpoint",
			data: { name: undefined, signSecret: "" },
		});
		expect(update.data).not.toHaveProperty("name");
		expect(update.data).toHaveProperty("signSecret", "");
		expect(() =>
			DOMAIN_WEBHOOK_CAPABILITIES.SEND_MESSAGE.parseInput({
				id: "endpoint",
				message: { text: "hello", level: "unknown" },
			}),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }));
	});
});
