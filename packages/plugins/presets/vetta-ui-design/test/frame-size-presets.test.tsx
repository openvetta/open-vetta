/**
 * 预设尺寸：数据本身站得住（无重复、尺寸为正）、iPad 横竖屏对调、新建落点避开已有 frame；
 * 以及底部面板的交互：新建和（从 Frame Menu 进来的）改尺寸共用这一块面板。
 */
import { expect, it, vi } from "vitest";

vi.mock("@vetta-org/plugin-sdk", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

import { act } from "react";
import { createRoot } from "react-dom/client";
import { BottomPanel } from "../src/canvas/BottomPanel";
import { FrameSizePanel } from "../src/canvas/FrameSizeUi";
import { formatSize, placeNewFrame, presetSize, SIZE_CATEGORIES } from "../src/vetd/size-presets";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(node: React.ReactNode) {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = createRoot(host);
	act(() => root.render(node));
	return {
		host,
		cleanup: () => {
			act(() => root.unmount());
			host.remove();
		},
	};
}

it("covers the five requested categories with unique, positive presets", () => {
	expect(SIZE_CATEGORIES.map((category) => category.id)).toEqual(["phone", "desktop", "watch", "paper", "ipad"]);
	const ids = SIZE_CATEGORIES.flatMap((category) => category.presets.map((preset) => preset.id));
	expect(new Set(ids).size).toBe(ids.length);
	for (const category of SIZE_CATEGORIES) {
		for (const preset of category.presets) {
			expect(preset.width).toBeGreaterThan(0);
			expect(preset.height).toBeGreaterThan(0);
		}
	}
	const watch = SIZE_CATEGORIES.find((category) => category.id === "watch");
	expect(watch?.presets.map((preset) => formatSize(preset))).toEqual(["187 × 223", "208 × 248"]);
	const paper = SIZE_CATEGORIES.find((category) => category.id === "paper");
	expect(paper?.presets.map((preset) => preset.name)).toEqual(["A4", "A5", "A6"]);
});

it("carries device screen corner radii; desktop and paper stay square", () => {
	const radiusOf = (id: string): number | undefined =>
		SIZE_CATEGORIES.flatMap((category) => category.presets).find((preset) => preset.id === id)?.radius;
	expect(radiusOf("iphone-17")).toBe(62);
	expect(radiusOf("iphone-16-plus")).toBe(55);
	expect(radiusOf("iphone-se")).toBeUndefined();
	expect(radiusOf("ipad-pro-13")).toBe(18);
	expect(radiusOf("watch-46")).toBeGreaterThan(0);
	expect(radiusOf("a4")).toBeUndefined();
	expect(radiusOf("macbook-pro-14")).toBeUndefined();
	// 圆角不能超过短边的一半，否则预设本身就是错的。
	for (const preset of SIZE_CATEGORIES.flatMap((category) => category.presets)) {
		expect(preset.radius ?? 0).toBeLessThanOrEqual(Math.min(preset.width, preset.height) / 2);
	}
});

it("swaps width and height only for orientable categories in landscape", () => {
	const ipad = SIZE_CATEGORIES.find((category) => category.id === "ipad");
	const phone = SIZE_CATEGORIES.find((category) => category.id === "phone");
	if (!ipad || !phone) throw new Error("categories missing");
	const pro = ipad.presets[0];
	const iphone = phone.presets[0];
	if (!pro || !iphone) throw new Error("presets missing");
	expect(presetSize(ipad, pro, "portrait")).toEqual({ width: 1032, height: 1376 });
	expect(presetSize(ipad, pro, "landscape")).toEqual({ width: 1376, height: 1032 });
	expect(presetSize(phone, iphone, "landscape")).toEqual({ width: iphone.width, height: iphone.height });
});

it("places a new frame at the viewport center unless a frame is in the way", () => {
	const size = { width: 100, height: 200 };
	expect(placeNewFrame(size, { x: 500, y: 500 }, [], 80)).toEqual({ x: 450, y: 400 });
	const blocking = [{ x: 400, y: 350, width: 300, height: 300 }];
	// 中心被压着：挪到最右边、顶边对齐最上面的 frame。
	expect(placeNewFrame(size, { x: 500, y: 500 }, blocking, 80)).toEqual({ x: 780, y: 350 });
});

it("bottom panel tabs switch category and a card click creates that size", () => {
	const created: Array<{ width: number; height: number; radius: number }> = [];
	const view = mount(<FrameSizePanel target={null} onPick={(size, radius) => created.push({ ...size, radius })} />);
	const tabs = [...view.host.querySelectorAll<HTMLButtonElement>("[role='tab']")];
	expect(tabs).toHaveLength(5);
	expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");

	act(() => tabs[3]?.click());
	const cards = [...view.host.querySelectorAll<HTMLButtonElement>("[role='tabpanel'] button")];
	expect(cards.map((card) => card.textContent)).toEqual([
		expect.stringContaining("A4"),
		expect.stringContaining("A5"),
		expect.stringContaining("A6"),
	]);
	expect(cards[0]?.textContent).toContain("794 × 1123");
	act(() => cards[0]?.click());
	// 纸张是直角。
	expect(created).toEqual([{ width: 794, height: 1123, radius: 0 }]);
	view.cleanup();
});

it("bottom panel is inert while closed and interactive when open", () => {
	const view = mount(
		<BottomPanel open={false} label="panel">
			<button type="button">x</button>
		</BottomPanel>,
	);
	const panel = () => view.host.querySelector("section") as HTMLElement;
	expect(panel().inert).toBe(true);
	expect(panel().getAttribute("aria-hidden")).toBe("true");
	view.cleanup();

	const open = mount(
		<BottomPanel open label="panel">
			<button type="button">x</button>
		</BottomPanel>,
	);
	expect((open.host.querySelector("section") as HTMLElement).inert).toBe(false);
	open.cleanup();
});

it("resize mode jumps to the frame's category, marks the matching card and says which frame it edits", () => {
	const picked: Array<{ width: number; height: number; radius: number }> = [];
	const view = mount(
		<FrameSizePanel
			target={{ name: "登录页", size: { width: 1376, height: 1032 } }}
			onPick={(size, radius) => picked.push({ ...size, radius })}
		/>,
	);
	// 1376 × 1032 是横着的 iPad Pro 13"：翻到 iPad 分类、切到横屏。
	const tabs = [...view.host.querySelectorAll<HTMLButtonElement>("[role='tab']")];
	expect(tabs[4]?.getAttribute("aria-selected")).toBe("true");
	expect(view.host.textContent).toContain("canvas.size.panelHintResize");
	const cards = [...view.host.querySelectorAll<HTMLButtonElement>("[role='tabpanel'] button")];
	const current = cards.filter((card) => card.className.includes("bg-primary/10"));
	expect(current).toHaveLength(1);
	expect(current[0]?.textContent).toContain("1376 × 1032");
	act(() => cards[1]?.click());
	expect(picked).toEqual([{ width: 1210, height: 834, radius: 18 }]);
	view.cleanup();
});
