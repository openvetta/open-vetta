import { describe, expect, it } from "vitest";
import { CAPABILITY_ERROR_CODES, CAPABILITY_PREFIXES } from "../src/contracts.js";
import { DOMAIN_PROJECT_CAPABILITIES, DOMAIN_SESSION_CAPABILITIES } from "../src/domain.js";

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
