import { describe, expect, it } from "vitest";
import { CAPABILITY_ERROR_CODES, CAPABILITY_PREFIXES } from "../../src/contracts.js";
import { DOMAIN_SESSION_CAPABILITIES } from "../../src/domain.js";

describe("session domain capabilities", () => {
	it("uses stable ids for session history and runtime project queries", () => {
		expect(Object.values(DOMAIN_SESSION_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}session.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}session.runtime-project.list`,
		]);
	});

	it("validates session query inputs and outputs", () => {
		expect(DOMAIN_SESSION_CAPABILITIES.LIST.parseInput({ cwd: "C:/workspace" })).toEqual({
			cwd: "C:/workspace",
		});
		expect(() => DOMAIN_SESSION_CAPABILITIES.LIST.parseInput({ cwd: "" })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
		expect(() =>
			DOMAIN_SESSION_CAPABILITIES.LIST_RUNTIME_PROJECTS.parseOutput([{ cwd: "C:/workspace", sessionCount: -1 }]),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_OUTPUT }));
		expect(() =>
			DOMAIN_SESSION_CAPABILITIES.LIST.parseOutput([
				{ id: "session", path: "C:/session.jsonl", cwd: "C:/workspace", firstMessage: "hello" },
			]),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_OUTPUT }));
	});
});
