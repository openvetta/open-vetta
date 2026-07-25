import { describe, expect, it } from "vitest";
import { CAPABILITY_ERROR_CODES, CAPABILITY_PREFIXES } from "../../src/contracts.js";
import {
	DOMAIN_QUICK_PANEL_CAPABILITIES,
	DOMAIN_SHORTCUT_CAPABILITIES,
	QUICK_PANEL_POST_SEND_BEHAVIORS,
	QUICK_PANEL_TRIGGERS,
} from "../../src/domain.js";

describe("shortcut and quick panel domain capabilities", () => {
	it("uses one stable id per shortcut and quick panel operation", () => {
		expect(Object.values(DOMAIN_SHORTCUT_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}shortcut.settings.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}shortcut.binding.set`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}shortcut.binding.reset`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}shortcut.binding.reset-all`,
		]);
		expect(Object.values(DOMAIN_QUICK_PANEL_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}quick-panel.trigger.set`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}quick-panel.post-send-behavior.set`,
		]);
	});

	it("validates shortcut settings and quick panel mutations", () => {
		expect(
			DOMAIN_SHORTCUT_CAPABILITIES.GET_SETTINGS.parseOutput({
				bindings: [
					{
						id: "new-session",
						defaultShortcut: "mod+n",
						shortcut: "mod+shift+n",
						isDefault: false,
					},
				],
				quickPanel: {
					trigger: QUICK_PANEL_TRIGGERS.MOD,
					postSendBehavior: QUICK_PANEL_POST_SEND_BEHAVIORS.BACKGROUND,
				},
			}),
		).toHaveProperty("bindings.0.id", "new-session");
		expect(DOMAIN_SHORTCUT_CAPABILITIES.SET_BINDING.parseInput({ id: "new-session", shortcut: "" })).toEqual({
			id: "new-session",
			shortcut: "",
		});
		expect(() =>
			DOMAIN_SHORTCUT_CAPABILITIES.SET_BINDING.parseInput({ id: "new-session", shortcut: false }),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }));
		expect(() => DOMAIN_QUICK_PANEL_CAPABILITIES.SET_TRIGGER.parseInput({ trigger: "control" })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
		expect(() =>
			DOMAIN_QUICK_PANEL_CAPABILITIES.SET_POST_SEND_BEHAVIOR.parseOutput({
				trigger: "none",
				postSendBehavior: "hidden",
			}),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_OUTPUT }));
	});
});
