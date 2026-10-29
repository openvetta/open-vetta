/**
 * 比宿主离屏窗口上限还高的 frame（长落地页）的位图。
 *
 * 宿主会把超限的视口静默夹到上限，截回来的图就比 frame 矮；画布上的位图是
 * object-cover 铺满 frame 的，矮图会被等比放大、左右裁掉——「冻结图像被裁剪」。
 * 这里用一个记录请求的假宿主代替离屏窗口，验证超高 frame 走分块拼接、拼出的图
 * 正好是 frame 的尺寸。
 */
import type { PluginOffscreenCaptureOptions, PluginOffscreenCaptureResult } from "@vetta-org/plugin-sdk";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	captureFrameOffscreen,
	OFFSCREEN_MAX_VIEWPORT_PX,
	type OffscreenRasterDeps,
} from "../src/canvas/offscreen-raster";

const SCALE = 2;

let requests: PluginOffscreenCaptureOptions[];
let drawn: Array<{ srcY: number; srcH: number; destY: number; destH: number }>;
let encoded: { type: string | undefined; quality: unknown } | null;

function scrollTopOf(prepare: string | undefined): number {
	const match = /var TOP = (\d+)/.exec(prepare ?? "");
	return match ? Number(match[1]) : 0;
}

const deps: OffscreenRasterDeps = {
	capture: async (options): Promise<PluginOffscreenCaptureResult> => {
		requests.push(options);
		return { dataUrl: `shot:${options.width}x${options.height}@${scrollTopOf(options.prepareScript)}`, scaleFactor: SCALE };
	},
	loadImage: async (dataUrl) => {
		const match = /^shot:(\d+)x(\d+)@/.exec(dataUrl);
		if (!match) throw new Error(`unexpected data url ${dataUrl}`);
		return { naturalWidth: Number(match[1]) * SCALE, naturalHeight: Number(match[2]) * SCALE } as HTMLImageElement;
	},
};

beforeEach(() => {
	requests = [];
	drawn = [];
	encoded = null;
	// happy-dom 没有 2D 上下文：记录每次 drawImage 的源/目标行段，拼接是否正确看它。
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
		return {
			fillStyle: "",
			fillRect: () => {},
			drawImage: (_image: unknown, _sx: number, sy: number, _sw: number, sh: number, _dx: number, dy: number, _dw: number, dh: number) => {
				drawn.push({ srcY: sy, srcH: sh, destY: dy, destH: dh });
			},
		} as unknown as CanvasRenderingContext2D;
	});
	vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (
		this: HTMLCanvasElement,
		type?: string,
		quality?: unknown,
	) {
		encoded = { type, quality };
		return `stitched:${this.width}x${this.height}`;
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

it("captures a frame within the host limit in a single shot", async () => {
	const result = await captureFrameOffscreen({ port: 5173, frameId: "home", width: 1440, height: 900, quality: 0.9 }, deps);
	expect(requests).toHaveLength(1);
	expect(requests[0]?.height).toBe(900);
	expect(result.dataUrl).toBe("shot:1440x900@0");
	expect(drawn).toHaveLength(0);
});

it("stitches a frame taller than the host limit into one image of exactly the frame size", async () => {
	// 1440×6200 的落地页：视口钉在 4096，第二块滚到 2104（与第一块重叠 1992 行）。
	const result = await captureFrameOffscreen(
		{ port: 5173, frameId: "home", width: 1440, height: 6200, quality: 0.9, slot: 1 },
		deps,
	);
	expect(requests.every((request) => request.height === OFFSCREEN_MAX_VIEWPORT_PX)).toBe(true);
	expect(requests.map((request) => scrollTopOf(request.prepareScript))).toEqual([0, 2104]);
	// 同一槽位的会话：分块不能跑到别的窗口上去。
	expect(new Set(requests.map((request) => request.sessionKey)).size).toBe(1);
	// 文档要撑到 frame 高度才滚得到底（内容比 frame 短时，剩下的是页面背景）。
	expect(requests[0]?.prepareScript).toContain("6200");
	// 最后一块出图后撤掉撑高、滚动归零，同槽位的下一帧不会接手一个滚到底的页面。
	expect(requests.at(-1)?.probeScript).toContain("scrollTo");
	expect(drawn.map((entry) => [entry.srcY, entry.destY, entry.destH])).toEqual([
		[0, 0, 4096 * SCALE],
		[1992 * SCALE, 4096 * SCALE, 2104 * SCALE],
	]);
	expect(result.dataUrl).toBe(`stitched:${1440 * SCALE}x${6200 * SCALE}`);
	expect(encoded).toEqual({ type: "image/jpeg", quality: 0.9 });
});

it("runs the delivery probe on the first tile only when asked", async () => {
	await captureFrameOffscreen({ port: 5173, frameId: "home", width: 1440, height: 6200, quality: 0.9, probeLayout: true }, deps);
	expect(requests[0]?.probeScript).toBeTruthy();
	expect(requests[0]?.probeScript).not.toContain("scrollTo");
});
