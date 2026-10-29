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
		expect(has(host, "interaction.deviceType")).toBe(true);
	});

	it("窄面板：路由操作、路径、页面列表都收起，设备类型和系统浏览器留着", () => {
		const host = render(true);
		for (const label of ["interaction.back", "interaction.forward", "interaction.reload", "interaction.home", "interaction.pages"]) {
			expect(has(host, label)).toBe(false);
		}
		expect(host.textContent).not.toContain("/detail");
		expect(has(host, "interaction.deviceType")).toBe(true);
		expect(has(host, "interaction.device")).toBe(true);
		expect(has(host, "interaction.openExternal")).toBe(true);
	});
});
