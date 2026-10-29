/**
 * 画框外壳：标题栏限宽、选中时的尺寸标签、还没画出来时的启动占位。
 *
 * 标题栏的宽度上限——缩小画布时相邻 frame 在屏幕上会靠得很近，标题不限宽就会横着
 * 叠到隔壁去（Figma 的做法是裁到 frame 自身宽度、超出的用省略号）。上限写在内联
 * style 里、用 --vetd-lscale 换算，缩放时不重渲染，所以这里断言的就是那条 calc。
 */
import { expect, it, vi } from "vitest";

vi.mock("@vetta-org/plugin-sdk", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { BridgeHub } from "../src/canvas/bridge-client";
import type { FrameMenuItem } from "../src/canvas/FrameMenu";
import { FrameView } from "../src/canvas/FrameView";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bridge = { register: () => {} } as unknown as BridgeHub;

function renderFrame(
	renaming: boolean,
	selected = false,
	raster: string | null = null,
	extra: {
		expanded?: boolean;
		menuItems?: FrameMenuItem[] | null;
	} = {},
): { host: HTMLElement; label: HTMLElement; cleanup: () => void } {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = createRoot(host);
	act(() => {
		root.render(
			<FrameView
				frame={{
					id: "home",
					file: "frames/home.tsx",
					title: "Home dynamics",
					x: 0,
					y: 0,
					width: 390,
					height: 1046,
					meta: { width: 390, height: 844, title: "Home dynamics" },
					...(extra.expanded ? { expanded: true as const } : {}),
				}}
				port={1234}
				getZoom={() => 1}
				bridge={bridge}
				selected={selected}
				entered={false}
				interactive
				resizable={extra.menuItems !== undefined}
				menuItems={extra.menuItems ?? null}
				onMenuSlot={() => {}}
				mounted={false}
				live={false}
				parked={false}
				raster={raster}
				reloadNonce={0}
				paintTick={0}
				moveDelta={null}
				resizeRect={null}
				placement={null}
				activity={undefined}
				buildError={null}
				renaming={renaming}
				onSelect={() => {}}
				onContextMenu={() => {}}
				onRenameStart={() => {}}
				onRenameCommit={() => {}}
				onRenameCancel={() => {}}
				onDragStart={() => {}}
				onDragDelta={() => {}}
				onDragEnd={() => {}}
			/>,
		);
	});
	const label = host.querySelector<HTMLElement>("[data-vetd-frame] > div");
	if (!label) throw new Error("title bar not rendered");
	return {
		host,
		label,
		cleanup: () => {
			act(() => root.unmount());
			host.remove();
		},
	};
}

it("clamps the title bar to the frame width and truncates the name", () => {
	const { label, cleanup } = renderFrame(false);
	// 390px / lscale：lscale 是 1/zoom，乘回缩放后正好是 frame 自身的宽度。
	expect(label.style.maxWidth).toBe("calc(390px / var(--vetd-lscale, 1))");
	const title = label.querySelector("button");
	expect(title?.className).toContain("truncate");
	// flex item 的 min-width 默认是 auto，不归零 truncate 不会生效。
	expect(title?.className).toContain("min-w-0");
	cleanup();
});

it("drops the clamp while renaming so the input is not cut off", () => {
	const { label, cleanup } = renderFrame(true);
	expect(label.style.maxWidth).toBe("");
	cleanup();
});

it("shows the size badge only while selected, under the frame", () => {
	const idle = renderFrame(false);
	expect(idle.host.textContent).not.toContain("390×1046");
	idle.cleanup();

	const active = renderFrame(false, true);
	const badge = [...active.host.querySelectorAll<HTMLElement>("div")].find(
		(node) => node.textContent === "390×1046",
	);
	expect(badge).toBeDefined();
	expect(badge?.className).toContain("bg-primary");
	// frame 底边下方、水平居中，且跟着 --vetd-lscale 反向缩放。
	expect(badge?.style.top).toBe("100%");
	expect(badge?.style.transform).toBe("translateX(-50%) scale(var(--vetd-lscale, 1))");
	active.cleanup();
});

it("covers a frame that has nothing painted yet with the loading overlay", () => {
	const pending = renderFrame(false);
	// 静态底 + 三点（见 FrameLoadingOverlay）。
	expect(pending.host.querySelector(".vetd-loading-dots")).not.toBeNull();
	pending.cleanup();

	// 有位图就说明这一帧已经画得出来了，占位不该再出现（位图自己盖在上面）。
	const painted = renderFrame(false, false, "data:image/png;base64,AAAA");
	expect(painted.host.querySelector(".vetd-loading-dots")).toBeNull();
	painted.cleanup();
});

function item(key: string, onSelect: () => void = () => {}): FrameMenuItem {
	return { key, icon: <svg data-icon={key} />, label: `label:${key}`, onSelect };
}

it("puts the Frame Menu left of a lone-selected frame, in the given order, and reports clicks", () => {
	const clicked: string[] = [];
	const { host, cleanup } = renderFrame(false, true, null, {
		menuItems: ["ask", "expand", "copy-image"].map((key) => item(key, () => clicked.push(key))),
	});
	const menu = host.querySelector<HTMLElement>("[data-vetd-frame-menu]");
	// 贴在 frame 左侧外部、与顶边对齐。
	expect(menu?.style.right).toBe("100%");
	expect(menu?.className).toContain("top-0");
	const buttons = [...(menu?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
	expect(buttons.map((button) => button.textContent)).toEqual(["label:ask", "label:expand", "label:copy-image"]);
	// 胶囊按钮、主题色、图标 + 文字。
	expect(buttons[0]?.className).toContain("rounded-full");
	expect(buttons[0]?.className).toContain("bg-primary");
	expect(buttons[0]?.querySelector("svg")).not.toBeNull();
	act(() => buttons[1]?.click());
	expect(clicked).toEqual(["expand"]);
	// 按钮下方留着浮层挂载点（追问输入框挂这里）。
	expect(menu?.lastElementChild?.hasAttribute("data-vetd-frame-menu-slot")).toBe(true);
	cleanup();
});

it("keeps only the horizontal resize handle on an expanded frame", () => {
	const { host, cleanup } = renderFrame(false, true, null, { expanded: true, menuItems: [item("expand")] });
	const handles = host.querySelectorAll('[class*="resize"]');
	expect(handles).toHaveLength(1);
	expect(handles[0]?.className).toContain("cursor-ew-resize");
	cleanup();
});

it("shows no Frame Menu without items", () => {
	const { host, cleanup } = renderFrame(false, true, null, { menuItems: [] });
	expect(host.querySelector("[data-vetd-frame-menu]")).toBeNull();
	cleanup();
});

it("renders the core action as a two-line hero capsule with its caption", () => {
	const { host, cleanup } = renderFrame(false, true, null, {
		menuItems: [
			{ ...item("ask"), variant: "hero", caption: "改「Home dynamics」", active: true },
			item("expand"),
		],
	});
	const [hero, plain] = [...host.querySelectorAll<HTMLButtonElement>("[data-vetd-frame-menu] button")];
	expect(hero?.textContent).toBe("label:ask改「Home dynamics」");
	expect(hero?.getAttribute("aria-expanded")).toBe("true");
	expect(hero?.className).toContain("ring-primary/30");
	// 其余按钮仍是普通的单行胶囊。
	expect(plain?.className).toContain("h-7");
	cleanup();
});
