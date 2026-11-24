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
	play = vi.fn(() => Promise.resolve());
	pause = vi.fn();
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
	previewHint: "悬停预览",
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
	const onPlay = vi.fn();
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	mounted.push({ root, container });
	act(() => {
		root.render(
			<PetActionGalleryView groups={groups} labels={labels} playDisabled={false} onPlay={onPlay} {...overrides} />,
		);
	});
	const button = (name: string) =>
		container.querySelector<HTMLButtonElement>(`button[aria-label="播放 ${name}"]`) as HTMLButtonElement;
	return { container, onPlay, button };
}

describe("桌宠动作画廊", () => {
	it("整页只放一个预览视频，打开时不播放", () => {
		const { container } = renderGallery();

		expect(container.querySelectorAll("video")).toHaveLength(1);
		expect(container.querySelector("video")?.getAttribute("src")).toBe("vetta-media://sleep.webm");
		expect(play).not.toHaveBeenCalled();
	});

	it("聚焦某个动作时切到它的预览并播放，离开后暂停", () => {
		const { container, button } = renderGallery();

		act(() => button("喝茶").focus());
		act(() => vi.advanceTimersByTime(200));

		expect(container.querySelector("video")?.getAttribute("src")).toBe("vetta-media://tea.webm");
		expect(play).toHaveBeenCalled();

		pause.mockClear();
		act(() => button("喝茶").blur());
		expect(pause).toHaveBeenCalled();
	});

	it("系统开启减少动态效果时只切换画面，不播放", () => {
		reducedMotion = true;
		const { container, button } = renderGallery();

		act(() => button("喝茶").focus());
		act(() => vi.advanceTimersByTime(200));

		expect(container.querySelector("video")?.getAttribute("src")).toBe("vetta-media://tea.webm");
		expect(play).not.toHaveBeenCalled();
	});

	it("点播放把动作交给桌宠，并短暂显示已开始", () => {
		const { container, onPlay, button } = renderGallery();

		act(() => button("喝茶").click());

		expect(onPlay).toHaveBeenCalledWith("tea");
		expect(button("喝茶").textContent).toContain("已开始");
		act(() => vi.advanceTimersByTime(2000));
		expect(button("喝茶").textContent).toContain("播放");
		expect(container.textContent).toContain("悬停预览");
	});

	it("桌宠没显示或缺素材时不能播放", () => {
		const { container, button } = renderGallery({ playDisabled: true });

		expect(button("睡觉").disabled).toBe(true);
		expect(container.textContent).toContain("先打开显示桌宠");

		const enabled = renderGallery();
		expect(enabled.button("再见").disabled).toBe(true);
		expect(enabled.button("睡觉").disabled).toBe(false);
	});
});
