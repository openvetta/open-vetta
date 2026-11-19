import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectWebgl2Support, selectTerminalRenderer } from "./select-terminal-renderer";

describe("selectTerminalRenderer", () => {
	const base = { hasWebgl2: true, hardwareAccelerated: true };

	it("只有当前活动格用 WebGL，避免多开终端互相踢掉上下文", () => {
		expect(selectTerminalRenderer({ ...base, isActiveLeaf: true })).toBe("webgl");
		expect(selectTerminalRenderer({ ...base, isActiveLeaf: false })).toBe("dom");
	});

	it("拿不到 webgl2 或关了硬件加速时一律走内置 DOM 渲染器", () => {
		expect(selectTerminalRenderer({ hasWebgl2: false, hardwareAccelerated: true, isActiveLeaf: true })).toBe("dom");
		expect(selectTerminalRenderer({ hasWebgl2: true, hardwareAccelerated: false, isActiveLeaf: true })).toBe("dom");
	});
});

describe("detectWebgl2Support", () => {
	it("拿得到 webgl2 上下文时返回 true", () => {
		const canvas = { getContext: (id: string) => (id === "webgl2" ? {} : null) } as unknown as HTMLCanvasElement;

		expect(detectWebgl2Support(() => canvas)).toBe(true);
	});

	it("创建上下文抛错时按不支持处理，不把异常抛到挂载路径上", () => {
		const canvas = {
			getContext: () => {
				throw new Error("webgl disabled");
			},
		} as unknown as HTMLCanvasElement;

		expect(detectWebgl2Support(() => canvas)).toBe(false);
	});
});

describe("终端渲染 addon 依赖", () => {
	it("不依赖 @xterm/addon-canvas：它只支持 xterm 5，销毁时会抛 onShowLinkUnderline", () => {
		const manifest = JSON.parse(readFileSync(new URL("../../../../../package.json", import.meta.url), "utf8")) as {
			dependencies?: Record<string, string>;
		};

		expect(manifest.dependencies?.["@xterm/addon-canvas"]).toBeUndefined();
	});
});
