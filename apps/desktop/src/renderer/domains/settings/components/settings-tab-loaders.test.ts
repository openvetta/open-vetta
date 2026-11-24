// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prefetchSettingsTab, SETTINGS_TAB_LOADERS, useIdleSettingsTabPrefetch } from "./settings-tab-loaders";

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("settings tab code prefetch", () => {
	it("loads only the selected tab and allows a later retry", async () => {
		const loadGeneral = vi
			.spyOn(SETTINGS_TAB_LOADERS, "general")
			.mockRejectedValueOnce(new Error("chunk unavailable"))
			.mockResolvedValue({ default: () => createElement("div") });
		const loadModels = vi.spyOn(SETTINGS_TAB_LOADERS, "models");
		prefetchSettingsTab("general");
		await Promise.resolve();
		prefetchSettingsTab("general");
		prefetchSettingsTab("unknown");
		expect(loadGeneral).toHaveBeenCalledTimes(2);
		expect(loadModels).not.toHaveBeenCalled();
	});
});

describe("settings tab idle prefetch", () => {
	const stubLoaders = () => {
		const page = { default: () => createElement("div") };
		return {
			appearance: vi.spyOn(SETTINGS_TAB_LOADERS, "appearance").mockResolvedValue(page),
			general: vi.spyOn(SETTINGS_TAB_LOADERS, "general").mockResolvedValue(page),
			models: vi.spyOn(SETTINGS_TAB_LOADERS, "models").mockResolvedValue(page),
			pet: vi.spyOn(SETTINGS_TAB_LOADERS, "pet").mockResolvedValue(page),
		};
	};

	it("waits for idle time, then loads the common tabs except the one already open", () => {
		vi.useFakeTimers();
		const loaders = stubLoaders();
		renderHook(() => useIdleSettingsTabPrefetch("general"));
		expect(loaders.appearance).not.toHaveBeenCalled();

		// jsdom 没有 requestIdleCallback，走 setTimeout 兜底。
		vi.advanceTimersByTime(500);
		expect(loaders.appearance).toHaveBeenCalledTimes(1);
		expect(loaders.models).toHaveBeenCalledTimes(1);
		expect(loaders.general).not.toHaveBeenCalled();
		expect(loaders.pet).not.toHaveBeenCalled();
	});

	it("does not reschedule when the user switches tabs", () => {
		vi.useFakeTimers();
		const loaders = stubLoaders();
		const { rerender } = renderHook(({ tab }) => useIdleSettingsTabPrefetch(tab), { initialProps: { tab: "pet" } });
		rerender({ tab: "models" });
		vi.advanceTimersByTime(500);
		expect(loaders.appearance).toHaveBeenCalledTimes(1);
	});

	it("cancels when settings closes before idle time", () => {
		vi.useFakeTimers();
		const loaders = stubLoaders();
		const { unmount } = renderHook(() => useIdleSettingsTabPrefetch("pet"));
		unmount();
		vi.advanceTimersByTime(5000);
		expect(loaders.appearance).not.toHaveBeenCalled();
	});
});
