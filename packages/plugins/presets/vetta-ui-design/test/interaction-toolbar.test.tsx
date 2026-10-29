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

function render(level: { iconOnly: boolean; hideRoute: boolean }): HTMLElement {
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
				iconOnly={level.iconOnly}
				hideRoute={level.hideRoute}
				device={null}
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
		const host = render({ iconOnly: false, hideRoute: false });
		for (const label of ["interaction.back", "interaction.forward", "interaction.reload", "interaction.home", "interaction.pages"]) {
			expect(has(host, label)).toBe(true);
		}
		expect(host.textContent).toContain("/detail");
		expect(has(host, "interaction.switchDevice")).toBe(true);
		// 宽面板里每个按钮都带文字标签。
		for (const label of ["interaction.switchDevice", "interaction.openExternal.short"]) expect(host.textContent).toContain(label);
		// 左边的路由胶囊只有图标，不带文字标签（名字在悬停提示和无障碍标签里）。
		for (const label of ["interaction.back", "interaction.forward", "interaction.reload", "interaction.home", "interaction.pages"]) {
			expect(host.textContent).not.toContain(label);
			expect(has(host, label)).toBe(true);
		}
		// 路由这一组是同一个带边框的胶囊，里面的按钮各自没有边框（不要一颗一颗分开）。
		const back = host.querySelector<HTMLElement>('button[aria-label="interaction.back"]');
		const group = back?.parentElement;
		expect(group?.className).toMatch(/rounded-full/);
		expect(group?.className).toMatch(/\bborder\b/);
		for (const label of ["interaction.back", "interaction.forward", "interaction.reload", "interaction.home"]) {
			const button = host.querySelector<HTMLElement>(`button[aria-label="${label}"]`);
			expect(button?.parentElement).toBe(group);
			expect(button?.className).not.toMatch(/\bborder\b/);
		}
		// 设备和浏览器打开仍是各自带边框的胶囊，与画布右上角的按钮一致。
		for (const label of ["interaction.switchDevice", "interaction.openExternal.short"]) {
			const button = host.querySelector<HTMLElement>(`button[aria-label="${label}"]`);
			expect(button?.className).toMatch(/rounded-full/);
			expect(button?.className).toMatch(/\bborder\b/);
		}
	});

	it("窄面板：路由操作、路径、页面列表都收起，设备类型和系统浏览器留着", () => {
		const host = render({ iconOnly: true, hideRoute: true });
		for (const label of ["interaction.back", "interaction.forward", "interaction.reload", "interaction.home", "interaction.pages"]) {
			expect(has(host, label)).toBe(false);
		}
		expect(host.textContent).not.toContain("/detail");
		// 窄面板只留图标，名字在无障碍标签里。
		expect(host.textContent).not.toContain("interaction.switchDevice");
		expect(host.textContent).not.toContain("interaction.openExternal.short");
		expect(has(host, "interaction.switchDevice")).toBe(true);
		expect(has(host, "interaction.openExternal.short")).toBe(true);
	});

	it("中间一档：路由胶囊还在，设备和浏览器打开只剩图标", () => {
		const host = render({ iconOnly: true, hideRoute: false });
		for (const label of ["interaction.back", "interaction.home", "interaction.pages"]) expect(has(host, label)).toBe(true);
		expect(host.textContent).not.toContain("interaction.switchDevice");
		expect(has(host, "interaction.switchDevice")).toBe(true);
		expect(has(host, "interaction.openExternal.short")).toBe(true);
	});

	it("头部永远一行：右侧按钮组和路由胶囊都不换行", () => {
		const host = render({ iconOnly: false, hideRoute: false });
		expect(host.innerHTML).not.toContain("flex-wrap");
	});

	it("设备浮层与画布尺寸面板同源：五个分类、同样的预设和像素，都能选，选完收起", () => {
		const picked: unknown[] = [];
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
					iconOnly
					hideRoute
					device={null}
					onPickDevice={(choice) => picked.push(choice)}
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
		act(() => (host.querySelector("[aria-label='interaction.switchDevice']") as HTMLElement).click());
		const items = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>("[role=menuitemradio]")];
		const tabs = [...host.querySelectorAll<HTMLElement>("[role=tab]")].map((tab) => tab.getAttribute("aria-label"));
		expect(tabs).toEqual([
			"canvas.size.category.phone",
			"canvas.size.category.desktop",
			"canvas.size.category.watch",
			"canvas.size.category.paper",
			"canvas.size.category.ipad",
		]);
		// 默认翻到 Phone：预设名和像素与画布面板一致。
		expect(items().map((item) => item.textContent)).toEqual(
			expect.arrayContaining(["interaction.mode.mobile", "interaction.device.follow", "iPhone 17 Pro402 × 874"]),
		);
		// 选中的是当前类型 / 跟随设计稿。
		expect(items().filter((item) => item.getAttribute("aria-checked") === "true").map((item) => item.textContent)).toEqual([
			"interaction.mode.mobile",
			"interaction.device.follow",
		]);
		// 切到 Desktop 分类，能选 MacBook。
		act(() => (host.querySelector("[aria-label='canvas.size.category.desktop']") as HTMLElement).click());
		const mac = items().find((item) => item.textContent?.startsWith('MacBook Pro 14"'));
		expect(mac?.textContent).toContain("1512 × 982");
		act(() => mac?.click());
		expect(picked).toEqual([{ id: "macbook-pro-14", orientation: "portrait" }]);
		expect(host.querySelector("[role=menu]")).toBeNull();
	});

	it("iPad 分类有横竖屏切换，选横屏带着方向；手机分类没有", () => {
		const picked: unknown[] = [];
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
					mode="other"
					iconOnly
					hideRoute
					device={null}
					onPickDevice={(choice) => picked.push(choice)}
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
		act(() => (host.querySelector("[aria-label='interaction.switchDevice']") as HTMLElement).click());
		expect(host.querySelector("[aria-pressed]")).toBeNull();
		act(() => (host.querySelector("[aria-label='canvas.size.category.ipad']") as HTMLElement).click());
		const landscape = [...host.querySelectorAll<HTMLElement>("[aria-pressed]")].find((button) => button.textContent === "canvas.size.landscape");
		act(() => landscape?.click());
		const first = host.querySelectorAll<HTMLElement>("[role=menuitemradio]")[4];
		act(() => first?.click());
		expect(picked).toHaveLength(1);
		expect((picked[0] as { orientation: string }).orientation).toBe("landscape");
	});

});
