import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@vetta-org/plugin-sdk", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

import { act } from "react";
import { createRoot } from "react-dom/client";
import { InteractionToolbar } from "../src/interaction/InteractionToolbar";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
	document.body.innerHTML = "";
});

function render(compact: boolean): HTMLElement {
	const host = document.createElement("div");
	document.body.appendChild(host);
	act(() =>
		createRoot(host).render(
			<InteractionToolbar
				path="/detail"
				canBack
				canForward
				frames={[{ id: "index", title: "Home" }]}
				currentFrameId="index"
				mode="mobile"
				compact={compact}
				deviceId={null}
				onPickDevice={() => {}}
				onBack={() => {}}
				onForward={() => {}}
				onReload={() => {}}
				onHome={() => {}}
				onPickFrame={() => {}}
				onPickMode={() => {}}
				onOpenExternal={() => {}}
			/>,
		),
	);
	return host;
}

const has = (host: HTMLElement, label: string): boolean => host.querySelector(`[aria-label="${label}"]`) !== null;

describe("InteractionToolbar", () => {
	it("宽面板：路由操作、路径、页面列表和设备类型都在", () => {
		const host = render(false);
		for (const label of ["interaction.back", "interaction.forward", "interaction.reload", "interaction.home", "interaction.pages"]) {
			expect(has(host, label)).toBe(true);
		}
		expect(host.textContent).toContain("/detail");
		expect(has(host, "interaction.deviceMenu")).toBe(true);
		// 宽面板里设备按钮带文字「切换设备」，窄面板只留图标。
		expect(host.textContent).toContain("interaction.switchDevice");
	});

	it("窄面板：路由操作、路径、页面列表都收起，设备类型和系统浏览器留着", () => {
		const host = render(true);
		for (const label of ["interaction.back", "interaction.forward", "interaction.reload", "interaction.home", "interaction.pages"]) {
			expect(has(host, label)).toBe(false);
		}
		expect(host.textContent).not.toContain("/detail");
		expect(host.textContent).not.toContain("interaction.switchDevice");
		expect(has(host, "interaction.deviceMenu")).toBe(true);
		expect(has(host, "interaction.openExternal")).toBe(true);
	});

	it("设备类型和机型合在一个按钮的浮层里：移动端才有机型一栏，选完收起", () => {
		const picked: string[] = [];
		const host = document.createElement("div");
		document.body.appendChild(host);
		act(() =>
			createRoot(host).render(
				<InteractionToolbar
					path="/"
					canBack={false}
					canForward={false}
					frames={[]}
					currentFrameId={null}
					mode="mobile"
					compact
					deviceId={null}
					onPickDevice={(id) => picked.push(`device:${id}`)}
					onBack={() => {}}
					onForward={() => {}}
					onReload={() => {}}
					onHome={() => {}}
					onPickFrame={() => {}}
					onPickMode={(mode) => picked.push(`mode:${mode}`)}
					onOpenExternal={() => {}}
				/>,
			),
		);
		expect(host.querySelector("[role=menu]")).toBeNull();
		act(() => (host.querySelector("[aria-label='interaction.deviceMenu']") as HTMLElement).click());
		const items = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>("[role=menuitemradio]")];
		const labels = items().map((item) => item.textContent);
		expect(labels).toEqual(expect.arrayContaining(["interaction.mode.mobile", "interaction.mode.desktop", "interaction.device.follow", "iPhone 17 Pro"]));
		// 选中的是当前类型 / 跟随设计稿。
		expect(items().filter((item) => item.getAttribute("aria-checked") === "true").map((item) => item.textContent)).toEqual([
			"interaction.mode.mobile",
			"interaction.device.follow",
		]);
		act(() => items().find((item) => item.textContent === "iPhone 17 Pro")?.click());
		expect(picked).toEqual(["device:iphone-17-pro"]);
		expect(host.querySelector("[role=menu]")).toBeNull();
	});
});
