import { describe, expect, it } from "vitest";
import { CAPABILITY_ERROR_CODES, CAPABILITY_PREFIXES } from "../../src/contracts.js";
import { DOMAIN_GENERAL_SETTINGS_CAPABILITIES, GENERAL_EXECUTION_MODES } from "../../src/domain.js";

describe("general settings domain capabilities", () => {
	it("uses one stable id per general settings operation", () => {
		expect(Object.values(DOMAIN_GENERAL_SETTINGS_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}general-settings.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}general-settings.notifications.set`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}general-settings.default-execution-mode.set`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}general-settings.workspace.set`,
		]);
	});

	it("validates settings snapshots and mutations", () => {
		expect(
			DOMAIN_GENERAL_SETTINGS_CAPABILITIES.GET.parseOutput({
				workspacePath: "C:/workspace",
				defaultExecutionMode: GENERAL_EXECUTION_MODES.FULL_ACCESS,
				notificationsEnabled: true,
				debugMode: false,
				sandbox: { status: "available", backend: "windows-host", platform: "win32" },
			}),
		).toHaveProperty("sandbox.backend", "windows-host");
		expect(DOMAIN_GENERAL_SETTINGS_CAPABILITIES.SET_DEFAULT_EXECUTION_MODE.parseInput({ mode: "sandbox" })).toEqual({
			mode: "sandbox",
		});
		expect(() =>
			DOMAIN_GENERAL_SETTINGS_CAPABILITIES.SET_DEFAULT_EXECUTION_MODE.parseInput({ mode: "inherit" }),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }));
		expect(() =>
			DOMAIN_GENERAL_SETTINGS_CAPABILITIES.GET.parseOutput({
				workspacePath: "C:/workspace",
				defaultExecutionMode: "full-access",
				notificationsEnabled: true,
				debugMode: false,
				sandbox: { status: "ready", backend: null, platform: "win32" },
			}),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_OUTPUT }));
	});
});
