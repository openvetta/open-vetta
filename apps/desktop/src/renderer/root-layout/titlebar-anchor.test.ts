// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { measureTitlebarCenter } from "./titlebar-anchor";

function anchor(top: number, height: number, inert = false): HTMLElement {
	const wrapper = document.createElement("div");
	if (inert) wrapper.setAttribute("inert", "");
	const el = document.createElement("div");
	el.setAttribute("data-titlebar-anchor", "");
	el.getBoundingClientRect = () => ({ top, height }) as DOMRect;
	wrapper.append(el);
	document.body.append(wrapper);
	return el;
}

afterEach(() => {
	document.body.replaceChildren();
});

describe("measureTitlebarCenter", () => {
	it("返回锚点的垂直中线", () => {
		anchor(14, 28);
		expect(measureTitlebarCenter(document)).toBe(28);
	});

	it("侧边栏收起（inert）后跳过它，量页头里的锚点", () => {
		anchor(16, 28, true);
		anchor(10, 36);
		expect(measureTitlebarCenter(document)).toBe(28);
	});

	it("没有可见锚点（如无页头的整页布局）时不上报", () => {
		anchor(16, 28, true);
		expect(measureTitlebarCenter(document)).toBeUndefined();
	});
});
