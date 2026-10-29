/**
 * 「导出」下拉的交互：点开先看到「制作渲染图 / 导出 Frame」，hover 导出 Frame 展开四个选项，没选中时「选中」两项禁用而不是消失；
 * 选一项就回调并收起；导出中按钮变成进度且不再能点开。
 */
import { expect, it, vi } from "vitest";

vi.mock("@vetta-org/plugin-sdk", () => ({
	useTranslation: () => ({
		t: (key: string, params?: Record<string, unknown>) =>
			params ? `${key}:${Object.values(params).join("/")}` : key,
	}),
}));

import { act } from "react";
import { createRoot } from "react-dom/client";
import { ExportMenu, type MaterialAction, type MaterialProgress } from "../src/canvas/ExportMenu";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(props: { selectedCount: number; totalCount: number; progress?: MaterialProgress | null }) {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = createRoot(host);
	const picked: MaterialAction[] = [];
	const paint = (next: typeof props): void => {
		act(() => {
			root.render(
				<ExportMenu
					selectedCount={next.selectedCount}
					totalCount={next.totalCount}
					progress={next.progress ?? null}
					onPick={(action) => picked.push(action)}
					onMakeMockup={() => picked.push("mockup" as MaterialAction)}
				/>,
			);
		});
	};
	paint(props);
	const trigger = (): HTMLButtonElement => {
		const button = host.querySelector<HTMLButtonElement>("button[aria-haspopup='menu']");
		if (!button) throw new Error("trigger missing");
		return button;
	};
	/** 展开「导出 Frame」二级菜单（hover / 聚焦 / 点击三条路径同一个状态，测试走点击）。 */
	const openFrames = (): void => {
		const row = host.querySelector<HTMLButtonElement>("[role='menuitem'][aria-haspopup='menu']");
		if (!row) throw new Error("frames row missing");
		act(() => row.click());
	};
	// 二级菜单里的四项（展开后才存在）。
	const items = (): HTMLButtonElement[] => [
		...host.querySelectorAll<HTMLButtonElement>("[role='menu'] [role='menu'] [role='menuitem']"),
	];
	const topItems = (): HTMLButtonElement[] =>
		[...host.querySelectorAll<HTMLButtonElement>("[role='menuitem']")].filter((item) => !items().includes(item));
	return {
		host,
		picked,
		trigger,
		items,
		topItems,
		openFrames,
		rerender: paint,
		cleanup: () => {
			act(() => root.unmount());
			host.remove();
		},
	};
}

it("opens the four actions, disabling the selection-scoped ones when nothing is selected", () => {
	const view = render({ selectedCount: 0, totalCount: 3 });
	expect(view.items()).toHaveLength(0);
	expect(view.trigger().getAttribute("aria-expanded")).toBe("false");

	act(() => view.trigger().click());
	expect(view.trigger().getAttribute("aria-expanded")).toBe("true");
	// 一级菜单：制作渲染图 + 导出 Frame；四个导出动作要展开二级才出现。
	expect(view.topItems().map((item) => item.textContent)).toEqual(["canvas.export.mockup", "canvas.export.frames"]);
	expect(view.items()).toHaveLength(0);
	view.openFrames();
	const labels = view.items().map((item) => [item.textContent, item.disabled]);
	expect(labels).toEqual([
		["canvas.download.selectedImages", true],
		["canvas.download.allImages", false],
		["canvas.download.selectedPdf", true],
		["canvas.download.allPdf", false],
	]);

	act(() => view.items()[3]?.click());
	expect(view.picked).toEqual(["all-pdf"]);
	// 选完即收起。
	expect(view.items()).toHaveLength(0);
	view.cleanup();
});

it("enables selection-scoped actions once frames are selected and closes on Escape", () => {
	const view = render({ selectedCount: 2, totalCount: 3 });
	act(() => view.trigger().click());
	view.openFrames();
	expect(view.items().map((item) => item.disabled)).toEqual([false, false, false, false]);
	act(() => view.items()[0]?.click());
	expect(view.picked).toEqual(["selected-images"]);

	act(() => view.trigger().click());
	view.openFrames();
	expect(view.items()).toHaveLength(4);
	act(() => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
	});
	expect(view.items()).toHaveLength(0);
	view.cleanup();
});

it("disables every action when the design has no frames", () => {
	const view = render({ selectedCount: 0, totalCount: 0 });
	act(() => view.trigger().click());
	view.openFrames();
	expect(view.items().map((item) => item.disabled)).toEqual([true, true, true, true]);
	view.cleanup();
});

it("shows progress on the trigger and blocks new picks while exporting", () => {
	const view = render({ selectedCount: 1, totalCount: 3 });
	act(() => view.trigger().click());
	view.openFrames();
	expect(view.items()).toHaveLength(4);

	view.rerender({ selectedCount: 1, totalCount: 3, progress: { done: 2, total: 5 } });
	expect(view.trigger().textContent).toContain("canvas.download.running:2/5");
	expect(view.trigger().disabled).toBe(true);
	// 进度一开始菜单就收起：进度显示在按钮上，菜单留着只会挡住它。
	expect(view.items()).toHaveLength(0);

	view.rerender({ selectedCount: 1, totalCount: 3, progress: null });
	expect(view.trigger().textContent).toContain("canvas.export.label");
	expect(view.trigger().disabled).toBe(false);
	view.cleanup();
});

it("制作渲染图直接回调并收起菜单", () => {
	const view = render({ selectedCount: 0, totalCount: 3 });
	act(() => view.trigger().click());
	act(() => view.topItems()[0]?.click());
	expect(view.picked).toEqual(["mockup"]);
	expect(view.topItems()).toHaveLength(0);
	view.cleanup();
});
