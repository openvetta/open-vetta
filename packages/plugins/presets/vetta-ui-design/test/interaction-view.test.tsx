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
		setInteractionMode: (mode: InteractionMode) => modes.push(mode),
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

	it("设备类别：存了用存的，老文档按首页尺寸推断", async () => {
		await render(fakeSession({ frames: [frame("index", 390, 844)] }).session);
		const checked = (): string | null | undefined => {
			act(() => (host.querySelector("[aria-label='interaction.switchDevice']") as HTMLElement).click());
			const value = host.querySelector("[role=menuitemradio][aria-checked=true]")?.textContent;
			act(() => (host.querySelector("[aria-label='interaction.switchDevice']") as HTMLElement).click());
			return value;
		};
		expect(checked()).toBe("interaction.mode.mobile");
		await render(fakeSession({ frames: [frame("index", 390, 844)], interactionMode: "other" }).session);
		expect(checked()).toBe("interaction.mode.other");
	});

	it("工具条改设备类别写回会话", async () => {
		const { session, modes } = fakeSession({ frames: [frame("index", 1440, 900)] });
		await render(session);
		act(() => (host.querySelector("[aria-label='interaction.switchDevice']") as HTMLElement).click());
		const other = [...host.querySelectorAll<HTMLElement>("[role=menuitemradio]")].find(
			(item) => item.textContent === "interaction.mode.other",
		);
		act(() => other?.click());
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
		const header = host.querySelector("[aria-hidden]")?.firstElementChild?.nextElementSibling as HTMLElement;
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
});
