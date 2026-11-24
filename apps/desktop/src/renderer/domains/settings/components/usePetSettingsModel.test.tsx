// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PET_CONFIG, type PetConfig } from "../../../../shared/pet-config";
import { usePetSettingsModel } from "./usePetSettingsModel";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

/** What the desktop pet side received: persisted config patches and actions it was told to play. */
const desktop = { savedPatches: [] as Partial<PetConfig>[], playedActions: [] as string[] };

const pet = {
	getConfig: vi.fn(async (): Promise<PetConfig> => ({ ...DEFAULT_PET_CONFIG, enabled: true })),
	setConfig: vi.fn(async (patch: Partial<PetConfig>): Promise<PetConfig> => {
		desktop.savedPatches.push(patch);
		return { ...DEFAULT_PET_CONFIG, enabled: true, ...patch };
	}),
	onConfigChanged: vi.fn(() => () => {}),
	show: vi.fn(),
	hide: vi.fn(),
	setAction: vi.fn(async (action: string) => {
		desktop.playedActions.push(action);
	}),
	getDecorations: vi.fn(async () => []),
	getActionVideos: vi.fn(async () => [
		{ id: "stoat_sleep_lie_on_cushion", found: true, url: "vetta-media://sleep.webm" },
		{ id: "stoat_skip_rope_jump", found: false },
	]),
};

vi.stubGlobal(
	"window",
	Object.assign(globalThis.window, { vetta: { pet, appMonitor: { recordEvent: vi.fn() } } }),
);

async function renderModel() {
	const view = renderHook(() => usePetSettingsModel());
	await act(async () => {
		await Promise.resolve();
	});
	return view;
}

describe("Vetta Vivi 设置模型", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		desktop.savedPatches = [];
		desktop.playedActions = [];
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("连续调整大小只写一次配置，取最后的值", async () => {
		const { result } = await renderModel();

		act(() => result.current.size.onCommit(1.05));
		act(() => result.current.size.onCommit(1.1));
		act(() => result.current.size.onCommit(1.15));
		expect(result.current.config.videoScale).toBeCloseTo(1.15);
		expect(desktop.savedPatches).toEqual([]);

		await act(async () => {
			vi.advanceTimersByTime(250);
		});

		expect(desktop.savedPatches).toHaveLength(1);
		expect(desktop.savedPatches[0]?.videoScale).toBeCloseTo(1.15);
	});

	it("按分组列出动作，带上可播放的视频地址", async () => {
		const { result } = await renderModel();

		const actions = result.current.actionGroups.flatMap((group) => group.actions);
		expect(result.current.actionGroups.map((group) => group.id)).toEqual(["idle", "working", "resting", "feedback"]);
		expect(actions).toHaveLength(8);
		expect(actions.find((action) => action.id === "stoat_sleep_lie_on_cushion")?.videoUrl).toBe(
			"vetta-media://sleep.webm",
		);
		expect(actions.find((action) => action.id === "stoat_skip_rope_jump")?.videoUrl).toBeUndefined();
	});

	it("播放动作交给桌宠，自动切换写入配置", async () => {
		const { result } = await renderModel();

		act(() => result.current.actions.playAction("stoat_skip_rope_jump"));
		expect(desktop.playedActions).toEqual(["stoat_skip_rope_jump"]);

		await act(async () => {
			result.current.actions.changeAutoMode(false);
		});
		expect(desktop.savedPatches).toEqual([{ autoMode: false }]);
	});
});
