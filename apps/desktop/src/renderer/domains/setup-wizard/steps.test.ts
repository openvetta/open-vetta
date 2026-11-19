import { describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => ({ mac: true }));

vi.mock("@shared/lib/platform", () => ({
	get isMac() {
		return flags.mac;
	},
}));

import { getSetupWizardSteps } from "./steps";

describe("getSetupWizardSteps", () => {
	it("macOS 依次引导语言外观、权限与欢迎页", () => {
		flags.mac = true;
		expect(getSetupWizardSteps()).toEqual(["languageAppearance", "permissions", "welcome"]);
	});

	it("非 macOS 跳过权限步", () => {
		flags.mac = false;
		expect(getSetupWizardSteps()).toEqual(["languageAppearance", "welcome"]);
	});
});
