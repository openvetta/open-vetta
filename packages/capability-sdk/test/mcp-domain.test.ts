import { describe, expect, it } from "vitest";
import { CAPABILITY_ERROR_CODES, CAPABILITY_PREFIXES } from "../src/contracts.js";
import { DOMAIN_MCP_CAPABILITIES } from "../src/domain.js";

describe("MCP domain capabilities", () => {
	it("uses one stable capability id per MCP server operation", () => {
		expect(Object.values(DOMAIN_MCP_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}mcp.server.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}mcp.server.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}mcp.server.upsert`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}mcp.server.set-enabled`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}mcp.server.remove`,
		]);
	});

	it("validates MCP server inputs and sanitized outputs", () => {
		expect(
			DOMAIN_MCP_CAPABILITIES.UPSERT_SERVER.parseInput({
				name: "web",
				data: {
					type: "http",
					url: "https://mcp.example.com",
					headers: { Authorization: "Bearer secret" },
				},
			}),
		).toEqual({
			name: "web",
			data: {
				type: "http",
				url: "https://mcp.example.com",
				headers: { Authorization: "Bearer secret" },
			},
		});
		expect(
			DOMAIN_MCP_CAPABILITIES.GET_SERVER.parseOutput({
				name: "web",
				type: "http",
				url: "https://mcp.example.com",
				headers: { Authorization: "***" },
				disabled: false,
			}),
		).toHaveProperty("headers.Authorization", "***");
		expect(() =>
			DOMAIN_MCP_CAPABILITIES.UPSERT_SERVER.parseInput({
				name: "web",
				data: { type: "http", command: "node" },
			}),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }));
		expect(() => DOMAIN_MCP_CAPABILITIES.SET_SERVER_ENABLED.parseInput({ name: "web", enabled: "yes" })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
	});
});
