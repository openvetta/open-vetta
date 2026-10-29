/**
 * 预设尺寸：数据本身站得住（无重复、尺寸为正）、iPad 横竖屏对调、新建落点避开已有 frame；
 * 以及两处入口——Frame Menu 的尺寸浮层（改已有 frame）和底部面板（新建）的交互。
 */
import { expect, it, vi } from "vitest";

vi.mock("@vetta-org/plugin-sdk", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

import { act } from "react";
import { createRoot } from "react-dom/client";
import { BottomPanel } from "../src/canvas/BottomPanel";
import { FrameSizeMenu, FrameSizePanel } from "../src/canvas/FrameSizeUi";
import { formatSize, placeNewFrame, presetSize, SIZE_CATEGORIES } from "../src/canvas/size-presets";

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

it("size menu lists presets with pixel sizes and applies the picked one", () => {
	const picked: Array<{ width: number; height: number }> = [];
	const view = mount(<FrameSizeMenu current={{ width: 393, height: 852 }} onPick={(size) => picked.push(size)} />);
	// 当前尺寸是 iPhone 17，所以默认展开 Phone，右侧每行都标着像素。
	const rows = [...view.host.querySelectorAll<HTMLButtonElement>("[role='menu'] [role='menu'] [role='menuitem']")];
	expect(rows[0]?.textContent).toContain("iPhone 17 Pro Max");
	expect(rows[0]?.textContent).toContain("440 × 956");

	const categories = [...view.host.querySelectorAll<HTMLButtonElement>("[aria-haspopup='menu']")];
	expect(categories.map((button) => button.textContent)).toEqual([
		"canvas.size.category.phone",
		"canvas.size.category.desktop",
		"canvas.size.category.watch",
		"canvas.size.category.paper",
		"canvas.size.category.ipad",
	]);
	act(() => categories[2]?.click());
	const watchRows = [...view.host.querySelectorAll<HTMLButtonElement>("[role='menu'] [role='menu'] [role='menuitem']")];
	act(() => watchRows[1]?.click());
	expect(picked).toEqual([{ width: 208, height: 248 }]);
	view.cleanup();
});

it("size menu offers portrait / landscape for iPad", () => {
	const picked: Array<{ width: number; height: number }> = [];
	const view = mount(<FrameSizeMenu current={{ width: 1, height: 1 }} onPick={(size) => picked.push(size)} />);
	const ipad = [...view.host.querySelectorAll<HTMLButtonElement>("[aria-haspopup='menu']")][4];
	act(() => ipad?.click());
	const landscape = [...view.host.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find((button) =>
		button.textContent?.includes("landscape"),
	);
	act(() => landscape?.click());
	const first = view.host.querySelector<HTMLButtonElement>("[role='menu'] [role='menu'] [role='menuitem']");
	expect(first?.textContent).toContain("1376 × 1032");
	act(() => first?.click());
	expect(picked).toEqual([{ width: 1376, height: 1032 }]);
	view.cleanup();
});

it("bottom panel tabs switch category and a card click creates that size", () => {
	const created: Array<{ width: number; height: number }> = [];
	const view = mount(<FrameSizePanel onCreate={(size) => created.push(size)} />);
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
	expect(created).toEqual([{ width: 794, height: 1123 }]);
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
