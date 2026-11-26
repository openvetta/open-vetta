import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vetta-org/plugin-sdk", () => ({
	useTranslation: () => ({ t: (key: string) => key, locale: "zh" }),
}));

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TemplateGalleryDialog } from "../src/cards/TemplateGalleryDialog";
import { resetDesignSystems, setDesignSystems } from "../src/design-systems/registry";
import type { DesignSystem } from "../src/design-systems/types";

// happy-dom 没有 IntersectionObserver；demo 预览的懒挂载需要它存在。全部当作进了视口，
// 这样「没挂 iframe」只能是因为卡片本来就不该挂，而不是因为没进视口。
class ImmediateIntersectionObserver {
	constructor(private readonly callback: (entries: { isIntersecting: boolean }[]) => void) {}
	observe(): void {
		this.callback([{ isIntersecting: true }]);
	}
	disconnect(): void {}
	unobserve(): void {}
}
vi.stubGlobal("IntersectionObserver", ImmediateIntersectionObserver);

/** React 19 的 act 需要这个开关，否则每次更新都会告警。 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
});

afterEach(() => {
	act(() => root.unmount());
	host.remove();
	document.body.innerHTML = "";
	resetDesignSystems();
});

function queryByLabel(label: string): HTMLElement {
	const element = document.body.querySelector<HTMLElement>(`[aria-label="${label}"]`);
	if (!element) throw new Error(`missing element: ${label}`);
	return element;
}

function fire(target: HTMLElement, type: string): void {
	act(() => {
		target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
	});
}

describe("TemplateGalleryDialog", () => {
	it("closes on the header close button", () => {
		const onClose = vi.fn();
		act(() => {
			root.render(<TemplateGalleryDialog onApply={vi.fn()} onClose={onClose} />);
		});

		fire(queryByLabel("ds.close"), "click");

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	// 画布入口把 Dialog 挂在画布根之下：portal 只逃出了 DOM，React 事件仍沿组件树冒泡。
	// 画布根的 pointerdown 会 setPointerCapture 并把随后的 click 改派给自己，Dialog 里
	// 的按钮就全点不动了——所以指针事件必须在蒙层这一层被吃掉。
	it("keeps pointer events from reaching the React-tree ancestor", () => {
		const onPointerDown = vi.fn();
		act(() => {
			root.render(
				// biome-ignore lint/a11y/noStaticElementInteractions: stands in for the canvas root
				<div onPointerDown={onPointerDown}>
					<TemplateGalleryDialog onApply={vi.fn()} onClose={vi.fn()} />
				</div>,
			);
		});

		fire(queryByLabel("ds.close"), "pointerdown");

		expect(onPointerDown).not.toHaveBeenCalled();
	});
});

describe("设计资源 Dialog 的 iframe 预算", () => {
	const html = "<!doctype html><html><body>demo</body></html>";
	const withDemo = (id: string): DesignSystem => ({
		id,
		name: id.toUpperCase(),
		category: "dev",
		vibe: "dark",
		blurb: "blurb",
		resources: [{ path: "demo.html", role: "demo", encoding: "text", content: html, bytes: html.length }],
		themeCss: "@theme { --color-primary: #000; }",
		designMd: `# ${id}`,
	});
	const frames = (): number => document.body.querySelectorAll("iframe").length;
	const tiles = (): HTMLButtonElement[] => [
		...document.body.querySelectorAll<HTMLButtonElement>("[role=dialog] .grid > button"),
	];

	// 和画廊风格墙同一个病：每张卡进视口就挂一个 1280px 的 iframe 并解析整份文档，
	// 几十张连排，滚动必卡。
	it("静止时一个 iframe 都不挂：滚动经过的卡片只铺封面", () => {
		setDesignSystems([withDemo("a"), withDemo("b"), withDemo("c")]);
		act(() => {
			root.render(<TemplateGalleryDialog onApply={vi.fn()} onClose={vi.fn()} />);
		});
		expect(tiles()).toHaveLength(3);
		expect(frames()).toBe(0);
	});

	it("悬停停留后只挂被悬停那一张，移开即卸", () => {
		vi.useFakeTimers();
		try {
			setDesignSystems([withDemo("a"), withDemo("b")]);
			act(() => {
				root.render(<TemplateGalleryDialog onApply={vi.fn()} onClose={vi.fn()} />);
			});
			fire(tiles()[0], "mouseover");
			// 刚掠过（滚动时光标下的卡片不断在换）不该立刻付解析一份文档的代价。
			expect(frames()).toBe(0);
			act(() => {
				vi.advanceTimersByTime(300);
			});
			expect(frames()).toBe(1);
			fire(tiles()[0], "mouseout");
			expect(frames()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
});
