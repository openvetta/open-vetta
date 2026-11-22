import { describe, expect, it } from "vitest";
import { CAPABILITY_ERROR_CODES, CAPABILITY_PREFIXES } from "../../src/contracts.js";
import {
	DOMAIN_CAPABILITY_CATALOG,
	DOMAIN_SHORTCUT_CAPABILITIES,
	DOMAIN_SHORTCUT_CAPABILITY_CATALOG,
} from "../../src/domain.js";

describe("shortcut domain capabilities", () => {
	it("uses one stable id per shortcut operation", () => {
		expect(Object.values(DOMAIN_SHORTCUT_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}shortcut.settings.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}shortcut.binding.set`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}shortcut.binding.reset`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}shortcut.binding.reset-all`,
		]);
	});

	it("validates shortcut settings and binding mutations", () => {
		expect(
			DOMAIN_SHORTCUT_CAPABILITIES.GET_SETTINGS.parseOutput({
				bindings: [
					{
						id: "new-session",
						defaultShortcut: "mod+n",
						shortcut: "mod+shift+n",
						isDefault: false,
						ignored: true,
					},
				],
				quickPanel: { trigger: "mod", postSendBehavior: "background" },
				ignored: true,
			}),
		).toEqual({
			bindings: [{ id: "new-session", defaultShortcut: "mod+n", shortcut: "mod+shift+n", isDefault: false }],
		});
		expect(
			DOMAIN_SHORTCUT_CAPABILITIES.SET_BINDING.parseInput({
				id: "new-session",
				shortcut: "",
				ignored: true,
			}),
		).toEqual({ id: "new-session", shortcut: "" });
		expect(() =>
			DOMAIN_SHORTCUT_CAPABILITIES.SET_BINDING.parseInput({ id: "new-session", shortcut: false }),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }));
		expect(() => DOMAIN_SHORTCUT_CAPABILITIES.RESET_BINDING.parseInput({ id: "   " })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
	});

	it("publishes the shortcut catalog without quick panel capabilities", () => {
		expect(DOMAIN_SHORTCUT_CAPABILITY_CATALOG).toHaveLength(4);
		expect(DOMAIN_SHORTCUT_CAPABILITY_CATALOG[0]?.outputSchema).toMatchObject({
			type: "object",
			required: ["bindings"],
			properties: {
				bindings: {
					type: "array",
					items: {
						type: "object",
						required: ["id", "defaultShortcut", "shortcut", "isDefault"],
					},
				},
			},
		});
		expect(DOMAIN_SHORTCUT_CAPABILITY_CATALOG[1]?.inputSchema).toMatchObject({
			required: ["id", "shortcut"],
			properties: {
				id: { type: "string", pattern: "\\S" },
				shortcut: { type: "string" },
			},
		});
		expect(() => JSON.stringify(DOMAIN_SHORTCUT_CAPABILITY_CATALOG)).not.toThrow();
		expect(DOMAIN_CAPABILITY_CATALOG.some((capability) => capability.id.includes("quick-panel"))).toBe(false);
	});
});
