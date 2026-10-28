/**
 * 状态栏设置的解析规则：用户没提就是灵动岛，只有手机界面才有。
 */
import { expect, it } from "vitest";
import { resolveStatusBar, statusBarNote } from "../src/vetd/status-bar";

it("defaults a mobile design to the Dynamic Island when nothing was said", () => {
	expect(resolveStatusBar({ product: "mobile" })).toBe("island");
});

it("lets the user's wish win over the default", () => {
	expect(resolveStatusBar({ product: "mobile", statusBar: "notch" })).toBe("notch");
	expect(resolveStatusBar({ product: "mobile", statusBar: "flat" })).toBe("flat");
	expect(resolveStatusBar({ product: "mobile", statusBar: "none" })).toBe("none");
});

it("stores nothing for designs that have no status bar to speak of", () => {
	expect(resolveStatusBar({ product: "desktop" })).toBeNull();
	expect(resolveStatusBar({ product: "landing" })).toBeNull();
	expect(resolveStatusBar({ frameSize: { width: 800, height: 800 } } as never)).toBeNull();
});

it("ignores a value it does not know instead of storing garbage", () => {
	expect(resolveStatusBar({ product: "mobile", statusBar: "dynamic-island" })).toBe("island");
	expect(resolveStatusBar({ product: "desktop", statusBar: 3 })).toBeNull();
});

it("tells the agent how to write the bar, or not to draw one", () => {
	expect(statusBarNote("island")).toContain('<StatusBar variant="island"');
	expect(statusBarNote("island")).toContain("@vetta/ios");
	expect(statusBarNote("none")).toContain("NO status bar");
	expect(statusBarNote("none")).not.toContain("<StatusBar");
});
