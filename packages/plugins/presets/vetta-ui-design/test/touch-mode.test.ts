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

describe("touch mode 与 scroll-snap", () => {
	const mouse = (type: string, x: number, y: number, target: Element): void => {
		target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
	};

	it("拖动期间临时关掉吸附（否则横向分页被吸回原位拖不动），松手恢复", () => {
		const root = document.documentElement;
		root.style.scrollSnapType = "x mandatory";
		document.body.innerHTML = '<div id="page" style="width:300px;height:200px">x</div>';
		const page = document.getElementById("page") as HTMLElement;
		setTouchMode(true);
		mouse("mousedown", 200, 50, page);
		mouse("mousemove", 150, 50, page);
		expect(root.style.scrollSnapType).toBe("none");
		mouse("mouseup", 150, 50, page);
		expect(root.style.scrollSnapType).toBe("x mandatory");
		root.style.scrollSnapType = "";
	});

	it("没有吸附的容器不受影响", () => {
		const root = document.documentElement;
		document.body.innerHTML = '<div id="page">x</div>';
		const page = document.getElementById("page") as HTMLElement;
		setTouchMode(true);
		mouse("mousedown", 200, 50, page);
		mouse("mousemove", 150, 50, page);
		expect(root.style.scrollSnapType).toBe("");
		mouse("mouseup", 150, 50, page);
	});
});
