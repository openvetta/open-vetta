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
		// Chunk requests the prefetch made, in order.
		const requested: string[] = [];
		let generalAttempts = 0;
		vi.spyOn(SETTINGS_TAB_LOADERS, "general").mockImplementation(async () => {
			requested.push("general");
			generalAttempts += 1;
			if (generalAttempts === 1) throw new Error("chunk unavailable");
			return { default: () => createElement("div") };
		});
		vi.spyOn(SETTINGS_TAB_LOADERS, "models").mockImplementation(async () => {
			requested.push("models");
			return { default: () => createElement("div") };
		});
		prefetchSettingsTab("general");
		await Promise.resolve();
		prefetchSettingsTab("general");
		prefetchSettingsTab("unknown");
		expect(requested).toEqual(["general", "general"]);
	});
});

describe("settings tab idle prefetch", () => {
	/** Stubs the tab chunks and returns the list of tabs whose code was requested. */
	const stubLoaders = (): string[] => {
		const page = { default: () => createElement("div") };
		const requested: string[] = [];
		for (const tab of ["appearance", "general", "models", "pet"] as const) {
			vi.spyOn(SETTINGS_TAB_LOADERS, tab).mockImplementation(async () => {
				requested.push(tab);
				return page;
			});
		}
		return requested;
	};

	it("waits for idle time, then loads the common tabs except the one already open", () => {
		vi.useFakeTimers();
		const requested = stubLoaders();
		renderHook(() => useIdleSettingsTabPrefetch("general"));
		expect(requested).toEqual([]);

		// jsdom 没有 requestIdleCallback，走 setTimeout 兜底。
		vi.advanceTimersByTime(500);
		expect([...requested].sort()).toEqual(["appearance", "models"]);
	});

	it("does not reschedule when the user switches tabs", () => {
		vi.useFakeTimers();
		const requested = stubLoaders();
		const { rerender } = renderHook(({ tab }) => useIdleSettingsTabPrefetch(tab), { initialProps: { tab: "pet" } });
		rerender({ tab: "models" });
		vi.advanceTimersByTime(500);
		expect(requested.filter((tab) => tab === "appearance")).toHaveLength(1);
	});

	it("cancels when settings closes before idle time", () => {
		vi.useFakeTimers();
		const requested = stubLoaders();
		const { unmount } = renderHook(() => useIdleSettingsTabPrefetch("pet"));
		unmount();
		vi.advanceTimersByTime(5000);
		expect(requested).toEqual([]);
	});
});
