import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { StatusBar } from "../engine/src/ios/StatusBar";
import { hasCustomStatusBar } from "../engine/src/status-bar-probe";
import { PhoneShell } from "../src/interaction/PhoneShell";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
	document.body.innerHTML = "";
});

function render(node: React.ReactElement): HTMLElement {
	const host = document.createElement("div");
	document.body.appendChild(host);
	act(() => createRoot(host).render(node));
	return host;
}

describe("引擎自带 StatusBar 的挖孔", () => {
	it("灵动岛和刘海各自带 data-vetd-cutout，flat 没有挖孔", () => {
		expect(render(<StatusBar variant="island" />).querySelectorAll("[data-vetd-cutout]")).toHaveLength(1);
		expect(render(<StatusBar variant="notch" />).querySelectorAll("[data-vetd-cutout]")).toHaveLength(1);
		expect(render(<StatusBar variant="flat" />).querySelectorAll("[data-vetd-cutout]")).toHaveLength(0);
	});

	it("时间不在挖孔里，藏挖孔不会带走它", () => {
		const host = render(<StatusBar variant="island" time="9:41" />);
		expect(host.querySelector("[data-vetd-cutout]")?.textContent).toBe("");
		expect(host.textContent).toContain("9:41");
	});
});

describe("设计手写的状态栏探测", () => {
	it("按源码插桩的文件名认，引擎自带的不算", () => {
		document.body.innerHTML = '<div data-vetd-source="frames/index.tsx:3"><div data-vetd-status-bar="island"></div></div>';
		expect(hasCustomStatusBar()).toBe(false);
		document.body.innerHTML = '<img data-vetd-source="components/StatusBar.tsx:6">';
		expect(hasCustomStatusBar()).toBe(true);
	});
});

describe("PhoneShell", () => {
	it("设计自带灵动岛时外壳让出自己的（Home 键款不受影响）", () => {
		const view = { width: 393, height: 852 };
		expect(render(<PhoneShell kind="island" viewport={view} hideIsland>x</PhoneShell>).querySelector(".vetd-no-island")).not.toBeNull();
		expect(render(<PhoneShell kind="island" viewport={view}>x</PhoneShell>).querySelector(".vetd-no-island")).toBeNull();
		expect(render(<PhoneShell kind="home" viewport={view} hideIsland>x</PhoneShell>).querySelector(".vetd-no-island")).toBeNull();
	});
});
