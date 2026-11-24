// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PetActionGalleryView, type PetActionGalleryViewProps } from "./PetActionGalleryView";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];
let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;
let reducedMotion = false;

beforeEach(() => {
	vi.useFakeTimers();
	reducedMotion = false;
	// Playback state lands on the element itself, so tests read what the preview is doing.
	play = vi.fn(function (this: HTMLMediaElement) {
		this.dataset.playback = "playing";
		this.dataset.everPlayed = "true";
		return Promise.resolve();
	});
	pause = vi.fn(function (this: HTMLMediaElement) {
		this.dataset.playback = "paused";
	});
	Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: play });
	Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: pause });
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		value: (query: string) => ({ matches: reducedMotion && query.includes("reduce"), media: query }),
	});
});

afterEach(() => {
	for (const { root, container } of mounted.splice(0)) {
		act(() => root.unmount());
		container.remove();
	}
	vi.useRealTimers();
});

const labels: PetActionGalleryViewProps["labels"] = {
	play: "播放",
	played: "已开始",
	previewHint: "动作",
	needShowPet: "先打开显示桌宠",
	videoMissing: "缺少动画素材",
};

const groups: PetActionGalleryViewProps["groups"] = [
	{
		id: "resting",
		label: "休息",
		actions: [
			{ id: "sleep", label: "睡觉", description: "趴着睡", videoUrl: "vetta-media://sleep.webm" },
			{ id: "tea", label: "喝茶", description: "慢慢喝", videoUrl: "vetta-media://tea.webm" },
		],
	},
	{
		id: "feedback",
		label: "反馈",
		actions: [{ id: "bye", label: "再见", description: "挥手", videoUrl: undefined }],
	},
];

function renderGallery(overrides: Partial<PetActionGalleryViewProps> = {}) {
	// Actions handed to the desktop pet, in order.
	const played: string[] = [];
	const onPlay = vi.fn((actionId: string) => {
		played.push(actionId);
	});
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	mounted.push({ root, container });
	act(() => {
		root.render(
			<PetActionGalleryView groups={groups} labels={labels} playDisabled={false} onPlay={onPlay} {...overrides} />,
		);
	});
	const chip = (name: string) =>
		[...container.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
			(button) => button.textContent === name,
		) as HTMLButtonElement;
	const playButton = () => container.querySelector<HTMLButtonElement>('button[aria-label^="播放"]') as HTMLButtonElement;
	const video = () => container.querySelector("video");
	return { container, played, chip, playButton, video };
}

describe("桌宠动作画廊", () => {
	it("每个动作是一个紧凑标签，整页只有一个预览视频和一个播放按钮，打开时不播放", () => {
		const { container, video } = renderGallery();

		expect(container.querySelectorAll("button[aria-pressed]")).toHaveLength(3);
		expect(container.querySelectorAll('button[aria-label^="播放"]')).toHaveLength(1);
		expect(container.querySelectorAll("video")).toHaveLength(1);
		expect(video()?.getAttribute("src")).toBe("vetta-media://sleep.webm");
		expect(video()?.dataset.everPlayed).toBeUndefined();
	});

	it("聚焦某个动作时预览它并显示说明，焦点离开画廊后暂停", () => {
		const { container, chip, video } = renderGallery();

		act(() => chip("喝茶").focus());
		act(() => vi.advanceTimersByTime(200));

		expect(video()?.getAttribute("src")).toBe("vetta-media://tea.webm");
		expect(container.textContent).toContain("慢慢喝");
		expect(video()?.dataset.playback).toBe("playing");

		act(() => chip("喝茶").blur());
		expect(video()?.dataset.playback).toBe("paused");
	});

	it("只是划过不选中时，播放的仍是已选动作，预览回到它", () => {
		const { chip, playButton, video, played } = renderGallery();

		act(() => chip("喝茶").focus());
		act(() => vi.advanceTimersByTime(200));
		act(() => chip("喝茶").blur());
		act(() => vi.advanceTimersByTime(200));

		expect(video()?.getAttribute("src")).toBe("vetta-media://sleep.webm");
		act(() => playButton().click());
		expect(played).toEqual(["sleep"]);
	});

	it("点选动作后播放交给桌宠，并短暂显示已开始", () => {
		const { chip, playButton, played } = renderGallery();

		act(() => chip("喝茶").click());
		expect(chip("喝茶").getAttribute("aria-pressed")).toBe("true");

		act(() => playButton().click());
		expect(played).toEqual(["tea"]);
		expect(playButton().textContent).toContain("已开始");
		act(() => vi.advanceTimersByTime(2000));
		expect(playButton().textContent).toContain("播放");
	});

	it("系统开启减少动态效果时只切换画面，不播放", () => {
		reducedMotion = true;
		const { chip, video } = renderGallery();

		act(() => chip("喝茶").click());

		expect(video()?.getAttribute("src")).toBe("vetta-media://tea.webm");
		expect(video()?.dataset.everPlayed).toBeUndefined();
	});

	it("桌宠没显示或选中的动作缺素材时不能播放", () => {
		const hidden = renderGallery({ playDisabled: true });
		expect(hidden.playButton().disabled).toBe(true);
		expect(hidden.container.textContent).toContain("先打开显示桌宠");

		const shown = renderGallery();
		expect(shown.playButton().disabled).toBe(false);
		act(() => shown.chip("再见").click());
		expect(shown.playButton().disabled).toBe(true);
		expect(shown.container.textContent).toContain("缺少动画素材");
	});
});
