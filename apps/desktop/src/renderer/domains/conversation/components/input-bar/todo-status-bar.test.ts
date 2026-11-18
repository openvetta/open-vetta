// @vitest-environment jsdom

import { TodoStatusBarView, type TodoStatusItem } from "@vetta-org/theme-ui/chat";
import { FROSTED_SURFACE_CLASS } from "@vetta-org/ui/utils";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const LABELS = {
	trigger: "待办",
	allDone: "全部完成",
	panelTitle: "待办清单",
	openPanel: "在面板中打开",
	statusDone: "已完成",
	statusInProgress: "进行中",
	statusPending: "待办",
};

const ITEMS: TodoStatusItem[] = [
	{ id: 1, content: "完成数学题一", status: "done" },
	{ id: 2, content: "完成数学题二", status: "in_progress" },
	{ id: 3, content: "完成数学题三", status: "pending" },
];

function render(items: readonly TodoStatusItem[], onOpenPanel?: () => void, className?: string) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	act(() => {
		root.render(createElement(TodoStatusBarView, { items, labels: LABELS, onOpenPanel, className }));
	});
	return {
		container,
		trigger: () => container.querySelector<HTMLButtonElement>("button[aria-label='待办']"),
		cleanup: () => {
			act(() => root.unmount());
			container.remove();
		},
	};
}

describe("TodoStatusBarView", () => {
	it("shows progress and the in-progress item on the trigger", () => {
		const view = render(ITEMS);
		const trigger = view.trigger();
		expect(trigger?.textContent).toContain("1/3");
		expect(trigger?.textContent).toContain("完成数学题二");
		view.cleanup();
	});

	it("falls back to the all-done label once every item is done", () => {
		const view = render(ITEMS.map((item) => ({ ...item, status: "done" as const })));
		expect(view.trigger()?.textContent).toContain("3/3");
		expect(view.trigger()?.textContent).toContain("全部完成");
		view.cleanup();
	});

	it("lets the host row own the spacing so the trigger lines up with its neighbours", () => {
		// 输入框下沿那一行把待办条和底部面板 pill 并排居中；待办条自带的上内边距会让它单独下沉。
		const standalone = render(ITEMS);
		expect(standalone.container.firstElementChild?.className).toContain("pt-1.5");
		standalone.cleanup();

		const inRow = render(ITEMS, undefined, "p-0");
		const wrapper = inRow.container.firstElementChild;
		expect(wrapper?.className).not.toContain("pt-1.5");
		expect(wrapper?.className).not.toContain("px-1");
		inRow.cleanup();
	});

	it("renders nothing without todos", () => {
		const view = render([]);
		expect(view.container.textContent).toBe("");
		view.cleanup();
	});

	it("keeps the panel's own corner radius instead of inheriting one from the portal", () => {
		// PopoverContent 用了 asChild，className 会并到同一个 motion.div 上：面板再写 rounded-[inherit]，
		// twMerge 会用它盖掉 FLOATING_SURFACE_CLASS 的 rounded-2xl，圆角变成从 portal 容器继承的 0。
		const view = render(ITEMS);
		act(() => {
			view.trigger()?.click();
		});

		const content = document.querySelector<HTMLElement>('[data-slot="popover-content"]');
		expect(content).not.toBeNull();
		const radiusTokens = (content?.className ?? "").split(/\s+/).filter((token) => token.startsWith("rounded"));
		expect(radiusTokens).not.toContain("rounded-[inherit]");
		expect(radiusTokens.length).toBeGreaterThan(0);
		view.cleanup();
	});

	it("paints the same surface as the model selector: frosted background, shadow and hairline", () => {
		// 与模型选择弹层同一层皮：毛玻璃底色 + FLOATING_SURFACE_CLASS 的外投影和深色细线。
		const view = render(ITEMS);
		act(() => {
			view.trigger()?.click();
		});

		const content = document.querySelector<HTMLElement>('[data-slot="popover-content"]');
		expect(content).not.toBeNull();
		const tokens = new Set((content?.className ?? "").split(/\s+/));
		for (const token of FROSTED_SURFACE_CLASS.split(/\s+/)) {
			expect(tokens.has(token)).toBe(true);
		}
		expect(tokens.has("bg-popover")).toBe(false);
		// 细线只保留深色模式那圈极淡描边，不能出现浅色模式的边框。
		expect(tokens.has("dark:ring-1")).toBe(true);
		expect(tokens.has("dark:ring-white/10")).toBe(true);
		// 外投影用任意值阴影，不能显式写成 shadow-none。
		expect([...tokens].some((token) => token.startsWith("shadow-["))).toBe(true);
		expect(tokens.has("shadow-none")).toBe(false);
		view.cleanup();
	});

	it("opens a popover listing every item and can jump to the activity panel", () => {
		const onOpenPanel = vi.fn();
		const view = render(ITEMS, onOpenPanel);
		act(() => {
			view.trigger()?.click();
		});

		const popover = document.querySelector("[data-radix-popper-content-wrapper]") ?? document.body;
		for (const item of ITEMS) {
			expect(popover.textContent).toContain(item.content);
		}
		expect(popover.textContent).toContain("待办清单");

		const openPanelButton = Array.from(popover.querySelectorAll("button")).find((button) =>
			button.textContent?.includes("在面板中打开"),
		);
		act(() => {
			openPanelButton?.click();
		});
		expect(onOpenPanel).toHaveBeenCalledOnce();
		view.cleanup();
	});
});
