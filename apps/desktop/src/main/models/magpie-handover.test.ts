import { beforeEach, describe, expect, it, vi } from "vitest";

const removeLegacyMagpiePreset = vi.fn();

vi.mock("../logger.js", () => ({ getAppLogger: () => ({ info: vi.fn(), warn: vi.fn() }) }));
vi.mock("./model-settings-host.js", () => ({ getDesktopModelSettingsService: () => ({}) }));
vi.mock("./magpie-legacy-preset.js", () => ({ removeLegacyMagpiePreset }));

describe("Magpie 交接提示", () => {
	beforeEach(() => {
		vi.resetModules();
		removeLegacyMagpiePreset.mockReset();
	});

	it("删过旧配置时只给界面领取一次,窗口重新加载不再弹", async () => {
		removeLegacyMagpiePreset.mockResolvedValue({ defaultModelCleared: false, noProvidersLeft: false });
		const { startLegacyMagpieMigration, takeMagpieHandoverNotice } = await import("./magpie-handover.js");
		startLegacyMagpieMigration();
		await expect(takeMagpieHandoverNotice()).resolves.toEqual({ defaultModelCleared: false, noProvidersLeft: false });
		await expect(takeMagpieHandoverNotice()).resolves.toBeNull();
	});

	it("没开始迁移或迁移失败时不弹", async () => {
		const { startLegacyMagpieMigration, takeMagpieHandoverNotice } = await import("./magpie-handover.js");
		await expect(takeMagpieHandoverNotice()).resolves.toBeNull();
		removeLegacyMagpiePreset.mockRejectedValue(new Error("disk full"));
		startLegacyMagpieMigration();
		await expect(takeMagpieHandoverNotice()).resolves.toBeNull();
	});
});
