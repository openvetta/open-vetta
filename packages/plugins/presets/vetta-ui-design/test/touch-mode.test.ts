import { afterEach, describe, expect, it } from "vitest";
import { setTouchMode } from "../engine/src/touch";

afterEach(() => {
	setTouchMode(false);
	document.body.innerHTML = "";
});

describe("touch mode", () => {
	it("开启后链接的原生拖放被拦下，关闭后恢复", () => {
		document.body.innerHTML = '<a href="/detail">story</a>';
		const link = document.querySelector("a") as HTMLAnchorElement;
		const drag = (): boolean => {
			const event = new Event("dragstart", { bubbles: true, cancelable: true });
			link.dispatchEvent(event);
			return event.defaultPrevented;
		};
		expect(drag()).toBe(false);
		setTouchMode(true);
		expect(drag()).toBe(true);
		expect(document.documentElement.hasAttribute("data-vetd-touch")).toBe(true);
		setTouchMode(false);
		expect(drag()).toBe(false);
		expect(document.documentElement.hasAttribute("data-vetd-touch")).toBe(false);
	});

	it("重复开启是幂等的，只有一个光标圆点", () => {
		setTouchMode(true);
		setTouchMode(true);
		expect(document.querySelectorAll("#vetd-touch-dot")).toHaveLength(1);
	});
});
