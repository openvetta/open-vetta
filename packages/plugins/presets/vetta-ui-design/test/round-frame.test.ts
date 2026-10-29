import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isRoundFrame, ROUND_FRAME_MIN_RADIUS } from "../engine/src/round-frame";
import { BridgeHub } from "../src/canvas/bridge-client";
import { ENGINE_FILES } from "../src/engine/engine-files";

describe("isRoundFrame", () => {
	it("设备屏幕级圆角算，画布默认的 12px 不算，脏值不算", () => {
		expect(isRoundFrame(62)).toBe(true);
		expect(isRoundFrame(ROUND_FRAME_MIN_RADIUS)).toBe(true);
		expect(isRoundFrame(12)).toBe(false);
		expect(isRoundFrame(0)).toBe(false);
		expect(isRoundFrame("62")).toBe(false);
		expect(isRoundFrame(undefined)).toBe(false);
	});
});

describe("引擎样式与物化清单", () => {
	it("圆角画框里关掉 backdrop-filter，且新文件已登记", () => {
		const styles = readFileSync(resolve(process.cwd(), "engine/src/styles.css"), "utf8");
		expect(styles).toContain("html[data-vetd-round] *");
		expect(styles).toContain("backdrop-filter: none !important");
		expect(ENGINE_FILES["src/round-frame.ts"]).toContain("ROUND_FRAME_MIN_RADIUS");
	});
});

describe("BridgeHub.setRadius", () => {
	it("发给对应画框，iframe 重载报 ready 后补发", () => {
		const hub = new BridgeHub();
		const sent: unknown[] = [];
		const iframe = { contentWindow: { postMessage: (message: unknown) => sent.push(message) } } as unknown as HTMLIFrameElement;
		hub.register("a", iframe);
		hub.setRadius("a", 62);
		expect(sent).toEqual([{ vetd: true, type: "frame-radius", radius: 62 }]);
	});
});
