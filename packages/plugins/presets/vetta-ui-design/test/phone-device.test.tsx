import { describe, expect, it } from "vitest";
import { resolvePhoneDevice } from "../src/interaction/device-shell";

describe("resolvePhoneDevice", () => {
	it("稿子尺寸对不上任何手机预设：没有设备信息，用 iPhone 17 Pro", () => {
		const device = resolvePhoneDevice({ selectedId: null, home: { width: 375, height: 700 } });
		expect(device).toEqual({ viewport: { width: 402, height: 874 }, radius: 49, kind: "island" });
		expect(resolvePhoneDevice({ selectedId: null, home: null }).viewport).toEqual({ width: 402, height: 874 });
	});

	it("尺寸正好是手机预设：视口不变，圆角用外壳自己的", () => {
		const device = resolvePhoneDevice({ selectedId: null, home: { width: 390, height: 844 } });
		expect(device).toEqual({ viewport: { width: 390, height: 844 }, radius: 49, kind: "notch" });
	});

	it("跟随设计稿时机身款式看状态栏设置：390 × 844 的灵动岛稿子不配刘海外壳", () => {
		const home = { width: 390, height: 844 };
		expect(resolvePhoneDevice({ selectedId: null, home, statusBar: "island" })).toEqual({
			viewport: home,
			radius: 49,
			kind: "island",
		});
		expect(resolvePhoneDevice({ selectedId: null, home, statusBar: "notch" }).kind).toBe("notch");
		expect(resolvePhoneDevice({ selectedId: null, home, statusBar: "none" }).kind).toBe("notch");
		expect(resolvePhoneDevice({ selectedId: null, home: null, statusBar: "notch" }).kind).toBe("notch");
	});

	it("手选机型时不受状态栏设置影响", () => {
		const device = resolvePhoneDevice({ selectedId: "iphone-14", home: null, statusBar: "island" });
		expect(device.kind).toBe("notch");
	});

	it("稿子声明了圆角也不套：外壳已经定了屏幕圆角", () => {
		expect(resolvePhoneDevice({ selectedId: null, home: { width: 393, height: 852, radius: 40 } }).radius).toBe(49);
	});

	it("工具条里选了机型就用所选，Home 键款是直角", () => {
		const device = resolvePhoneDevice({ selectedId: "iphone-se", home: { width: 393, height: 852, radius: 62 } });
		expect(device).toEqual({ viewport: { width: 375, height: 667 }, radius: 4, kind: "home" });
	});
});

describe("DeviceShell 圆角", () => {
	it("不覆盖机身和屏幕的圆角，交给外壳库", async () => {
		const { createRoot } = await import("react-dom/client");
		const { act } = await import("react");
		const { DeviceShell } = await import("../src/interaction/DeviceShell");
		(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		const host = document.createElement("div");
		document.body.appendChild(host);
		act(() => createRoot(host).render(<DeviceShell kind="island" viewport={{ width: 402, height: 874 }}>x</DeviceShell>));
		expect((host.querySelector(".device-frame") as HTMLElement).style.borderRadius).toBe("");
		expect((host.querySelector(".device-screen") as HTMLElement).style.borderRadius).toBe("");
		host.remove();
	});
});
