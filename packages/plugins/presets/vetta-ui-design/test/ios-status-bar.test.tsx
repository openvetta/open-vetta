/**
 * iOS 状态栏预设。像素级对照是对着模拟器截图人工做过的（见组件文件头的说明），这里
 * 守的是接口行为：变体与安全区高度、挖孔有没有画、颜色、占位还是悬浮、被拉宽时不缩放。
 */
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { STATUS_BAR_HEIGHT, StatusBar } from "../engine/src/ios/StatusBar";
import { ENGINE_FILES } from "../src/engine/engine-files";

const html = (props: Parameters<typeof StatusBar>[0] = {}): string => renderToStaticMarkup(<StatusBar {...props} />);

it("defaults to the Dynamic Island variant at its safe-area height", () => {
	const out = html();
	expect(out).toContain('data-vetd-status-bar="island"');
	expect(out).toContain("height:59px");
	expect(out).toContain("9:41");
	// 灵动岛是一个圆角胶囊，不是 svg 路径
	expect(out).toContain("border-radius:18.17px");
});

it("draws the notch as a path, and nothing at all for flat", () => {
	const notch = html({ variant: "notch" });
	expect(notch).toContain('data-vetd-status-bar="notch"');
	expect(notch).toContain("height:47px");
	expect(notch).toContain("<path");
	expect(notch).toContain("fill=\"#000\"");

	const flat = html({ variant: "flat" });
	expect(flat).toContain("height:47px");
	expect(flat).not.toContain("border-radius:18.17px");
	expect(flat).not.toContain('fill="#000"');
});

it("exposes the safe-area heights the prompt tells the agent to reserve", () => {
	expect(STATUS_BAR_HEIGHT).toEqual({ island: 59, notch: 47, flat: 47 });
});

it("takes the glyph colour from tone, or inherits it", () => {
	expect(html({ tone: "dark" })).toContain("color:#000");
	expect(html({ tone: "light" })).toContain("color:#fff");
	expect(html()).not.toContain("color:#");
});

it("takes space by default and floats above content with overlay", () => {
	expect(html()).toContain("position:relative");
	const overlay = html({ overlay: true });
	expect(overlay).toContain("position:absolute");
	expect(overlay).toContain("top:0");
});

it("stretches with its frame instead of scaling", () => {
	const out = html();
	expect(out).toContain("width:100%");
	// 两侧各占剩余空间，挖孔固定宽度居中
	expect(out).toContain("grid-template-columns:1fr 125px 1fr");
});

it("shows the given time and battery level", () => {
	expect(html({ time: "10:24" })).toContain("10:24");
	// 电量 50 的内芯宽度是满电的一半：(25 - 4) * 0.5
	expect(html({ battery: 50 })).toContain('width="10.5"');
});

it("is registered so the engine materialises it", () => {
	expect(ENGINE_FILES["src/ios/StatusBar.tsx"]).toContain("export function StatusBar");
	expect(ENGINE_FILES["vite.config.mjs"]).toContain('"@vetta/ios"');
});
