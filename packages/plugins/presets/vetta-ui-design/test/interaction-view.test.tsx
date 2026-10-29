import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vetta-org/plugin-sdk", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../src/plugin-context", () => ({
	getPluginCtx: () => ({ ui: { openExternal: () => Promise.resolve() } }),
	notify: () => {},
}));

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { InteractionView } from "../src/interaction/InteractionView";
import type { DesignSession } from "../src/vetd/design-session";
import type { InteractionMode } from "../src/vetd/interaction-mode";
import type { VetdFrameEntry, VetdManifest } from "../src/vetd/manifest-types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class StubResizeObserver {
	observe(): void {}
	disconnect(): void {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= StubResizeObserver;

function frame(id: string, width: number, height: number, x = 0): VetdFrameEntry {
	return { id, title: id, file: `frames/${id}.tsx`, x, y: 0, width, height, meta: { width, height, title: id } };
}

function fakeSession(manifest: Partial<VetdManifest>): { session: DesignSession; modes: InteractionMode[] } {
	const modes: InteractionMode[] = [];
	const session = {
		manifest: { version: 1, type: "vetta-design", canvas: { x: 0, y: 0, zoom: 1 }, frames: [], ...manifest },
		on: () => ({ dispose: () => {} }),
		readThemeCss: async () => "@theme {\n  --color-background: #faf7f2;\n}",
		setInteractionMode: (mode: InteractionMode) => {
			modes.push(mode);
			(session as unknown as { manifest: VetdManifest }).manifest.interactionMode = mode;
		},
	} as unknown as DesignSession;
	return { session, modes };
}

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
});

let instance = 0;

/** 每次渲染都是新实例（key 不同）：iframe 的 src 只在挂载时算一次。 */
async function render(session: DesignSession, active = true): Promise<void> {
	instance += 1;
	await act(async () => {
		root.render(<InteractionView key={instance} port={5173} session={session} active={active} trailingSlot={<span>toggle</span>} />);
		await Promise.resolve();
	});
}

describe("InteractionView", () => {
	it("默认进入首页：有 index 就是它，iframe 以首页画框的设计尺寸渲染", async () => {
		const { session } = fakeSession({ frames: [frame("login", 390, 844), frame("index", 1440, 900, 500)] });
		await render(session);
		const iframe = host.querySelector("iframe");
		expect(iframe?.getAttribute("src")).toBe("http://127.0.0.1:5173/");
		expect(iframe?.style.width).toBe("1440px");
		expect(iframe?.style.height).toBe("900px");
	});

	it("没有 index 时首页回落到字典序第一帧（视口尺寸取它），没有画框不起 iframe", async () => {
		await render(fakeSession({ frames: [frame("b", 390, 844), frame("a", 1280, 800)] }).session);
		expect((host.querySelector("iframe") as HTMLElement).style.width).toBe("1280px");
		await render(fakeSession({ frames: [] }).session);
		expect(host.querySelector("iframe")).toBeNull();
	});

	it("设备类别：存了用存的，老文档按首页尺寸推断（按钮的图标和提示反映它）", async () => {
		const title = (): string => (host.querySelector("[aria-label='interaction.switchDevice']") as HTMLElement).title;
		await render(fakeSession({ frames: [frame("index", 390, 844)] }).session);
		expect(title()).toContain("interaction.mode.mobile");
		await render(fakeSession({ frames: [frame("index", 390, 844)], interactionMode: "other" }).session);
		expect(title()).toContain("interaction.mode.other");
	});

	it("选一个纸张预设，设备类型随之写回会话（没有单独的类型选择）", async () => {
		const { session, modes } = fakeSession({ frames: [frame("index", 1440, 900)] });
		await render(session);
		act(() => (host.querySelector("[aria-label='interaction.switchDevice']") as HTMLElement).click());
		expect(host.textContent).not.toContain("interaction.deviceType");
		act(() => (host.querySelector("[aria-label='canvas.size.category.paper']") as HTMLElement).click());
		const a4 = [...host.querySelectorAll<HTMLElement>("[role=menuitemradio]")].find((item) => item.textContent?.startsWith("A4"));
		await act(async () => a4?.click());
		expect(modes).toEqual(["other"]);
	});

	it("不在交互模式时整块隐藏但保持挂载", async () => {
		const { session } = fakeSession({ frames: [frame("index", 390, 844)] });
		await render(session, false);
		const view = host.firstElementChild as HTMLElement;
		expect(view.style.visibility).toBe("hidden");
		expect(host.querySelector("iframe")).not.toBeNull();
	});

	it("顶部条：左边是导航，设备类别在右边，开关在最右端，且顶部条没有自己的底色", async () => {
		const { session } = fakeSession({ frames: [frame("index", 1440, 900)] });
		await render(session);
		const header = host.querySelector("[aria-hidden] > .z-10") as HTMLElement;
		expect(header.className).not.toMatch(/\bbg-/);
		const order = [...header.querySelectorAll<HTMLElement>("button, select")].map(
			(element) => element.getAttribute("aria-label") ?? element.textContent ?? "",
		);
		const index = (label: string): number => order.findIndex((entry) => entry.includes(label));
		// 设计 / 交互开关在最右端。
		expect(header.lastElementChild?.textContent).toBe("toggle");
		expect(index("interaction.back")).toBeLessThan(index("interaction.switchDevice"));
		expect(index("interaction.home")).toBeLessThan(index("interaction.openExternal.short"));
	});

	it("舞台底色之上有两层不挡点击的覆盖层：灰色夹层和底部主色渐变", async () => {
		await render(fakeSession({ frames: [frame("index", 1440, 900)] }).session);
		const layers = host.querySelectorAll("[aria-hidden] > .pointer-events-none.absolute.inset-0");
		// 渐变的具体取值见 stage.ts 的 stageGlow 单测（happy-dom 解析不了 color-mix）。
		expect(layers).toHaveLength(2);
	});

	it("头部不换行：不带 flex-wrap，宽度不够靠逐级收起而不是掉到第二行", async () => {
		await render(fakeSession({ frames: [frame("index", 1440, 900)] }).session);
		const header = host.querySelector("[aria-hidden] > .z-10") as HTMLElement;
		expect(header.className).not.toContain("flex-wrap");
	});

	it("选了别的类别的设备预设：设备类型跟着切，视口就是预设的尺寸；选回跟随设计稿则恢复", async () => {
		const { session, modes } = fakeSession({ frames: [frame("index", 393, 852)], interactionMode: "mobile" });
		await render(session);
		const iframeWidth = (): string => (host.querySelector("iframe") as HTMLElement).style.width;
		expect(iframeWidth()).toBe("393px");
		const open = (): void => act(() => (host.querySelector("[aria-label='interaction.switchDevice']") as HTMLElement).click());
		open();
		act(() => (host.querySelector("[aria-label='canvas.size.category.desktop']") as HTMLElement).click());
		const mac = [...host.querySelectorAll<HTMLElement>("[role=menuitemradio]")].find((item) => item.textContent?.startsWith('MacBook Pro 14"'));
		await act(async () => mac?.click());
		expect(modes).toEqual(["desktop"]);
		expect(iframeWidth()).toBe("1512px");
		// 选回「跟随设计稿」：设备类型还是桌面端（它已经改了），但视口回到稿子自己的尺寸。
		open();
		const follow = [...host.querySelectorAll<HTMLElement>("[role=menuitemradio]")].find((item) => item.textContent === "interaction.device.follow");
		await act(async () => follow?.click());
		expect(iframeWidth()).toBe("393px");
	});
});
