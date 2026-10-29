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
		root.render(<InteractionView key={instance} port={5173} session={session} active={active} titleSlot={<span>title</span>} />);
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

	it("没有 index 回落到字典序第一帧，没有画框不起 iframe", async () => {
		await render(fakeSession({ frames: [frame("b", 390, 844), frame("a", 390, 844)] }).session);
		expect(host.querySelector("iframe")?.getAttribute("src")).toBe("http://127.0.0.1:5173/a");
		await render(fakeSession({ frames: [] }).session);
		expect(host.querySelector("iframe")).toBeNull();
	});

	it("设备类别：存了用存的，老文档按首页尺寸推断", async () => {
		await render(fakeSession({ frames: [frame("index", 390, 844)] }).session);
		const checked = () => host.querySelector("[role=radio][aria-checked=true]:not(:disabled)")?.textContent;
		expect(checked()).toBe("interaction.mode.mobile");
		await render(fakeSession({ frames: [frame("index", 390, 844)], interactionMode: "other" }).session);
		expect(checked()).toBe("interaction.mode.other");
	});

	it("工具条改设备类别写回会话", async () => {
		const { session, modes } = fakeSession({ frames: [frame("index", 1440, 900)] });
		await render(session);
		const desktop = [...host.querySelectorAll<HTMLButtonElement>("[role=radio]")].find(
			(button) => button.textContent === "interaction.mode.other",
		);
		act(() => desktop?.click());
		expect(modes).toEqual(["other"]);
	});

	it("不在交互模式时整块隐藏但保持挂载", async () => {
		const { session } = fakeSession({ frames: [frame("index", 390, 844)] });
		await render(session, false);
		const view = host.firstElementChild as HTMLElement;
		expect(view.style.visibility).toBe("hidden");
		expect(host.querySelector("iframe")).not.toBeNull();
	});
});
