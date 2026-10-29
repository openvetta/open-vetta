/**
 * 展开 frame：显示高度的派生，以及按需量完整内容高度的那个 hook。
 *
 * 量高度走离屏窗口，是唯一的外部边界：这里换成一个记录调用、手动放行的假函数，
 * 看「谁会被量、什么时候重量、一次只量一个」。
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { displayFrames, isExpandable, useFrameExtents } from "../src/canvas/frame-extent";
import type { VetdFrameEntry } from "../src/vetd/manifest-types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function frame(id: string, height: number, expanded = false): VetdFrameEntry {
	return {
		id,
		file: `frames/${id}.tsx`,
		x: 0,
		y: 0,
		width: 1440,
		height,
		title: id,
		meta: { width: 1440, height, title: id },
		...(expanded ? { expanded: true as const } : {}),
	};
}

it("only calls a frame expandable once its measured content is taller than the design size", () => {
	expect(isExpandable(frame("a", 900), null)).toBe(false);
	expect(isExpandable(frame("a", 900), 901)).toBe(false);
	expect(isExpandable(frame("a", 900), 6200)).toBe(true);
});

it("swaps in the content height only for expanded frames, keeping other references", () => {
	const plain = frame("plain", 900);
	const open = frame("open", 900, true);
	const unmeasured = frame("unmeasured", 900, true);
	const heights = new Map([
		["plain", 6200],
		["open", 6200],
	]);
	const shown = displayFrames([plain, open, unmeasured], (id) => heights.get(id) ?? null);
	expect(shown[0]).toBe(plain);
	expect(shown[1]).toMatchObject({ height: 6200, expanded: true });
	// 标准尺寸不动：显示高度只活在派生出来的那一份里。
	expect(open.height).toBe(900);
	expect(shown[2]).toBe(unmeasured);
});

interface Pending {
	frameId: string;
	resolve(height: number): void;
}

let unmount: (() => void) | null = null;
afterEach(() => {
	unmount?.();
	unmount = null;
});

function mountHook(initial: { frames: VetdFrameEntry[]; wanted: string[]; versions: Record<string, string> }) {
	const pending: Pending[] = [];
	const measure = (target: VetdFrameEntry): Promise<number> =>
		new Promise((resolve) => pending.push({ frameId: target.id, resolve }));
	let query: (frameId: string) => number | null = () => null;
	function Probe(props: typeof initial) {
		query = useFrameExtents({
			frames: props.frames,
			wanted: props.wanted,
			versionOf: (frameId) => props.versions[frameId] ?? null,
			measure,
		});
		return null;
	}
	const host = document.createElement("div");
	const root = createRoot(host);
	act(() => root.render(<Probe {...initial} />));
	unmount = () => act(() => root.unmount());
	return {
		pending,
		heightOf: (frameId: string) => query(frameId),
		rerender: (next: typeof initial) => act(() => root.render(<Probe {...next} />)),
		finish: async (height: number) => {
			const next = pending.shift();
			if (!next) throw new Error("nothing is being measured");
			await act(async () => next.resolve(height));
		},
	};
}

it("measures wanted frames one at a time and remeasures when the content version changes", async () => {
	const frames = [frame("a", 900), frame("b", 844)];
	const hook = mountHook({ frames, wanted: ["a", "b"], versions: { a: "r1", b: "r1" } });
	// 一次只量一个：b 要等 a 量完。
	expect(hook.pending.map((entry) => entry.frameId)).toEqual(["a"]);
	await hook.finish(6200);
	expect(hook.heightOf("a")).toBe(6200);
	expect(hook.pending.map((entry) => entry.frameId)).toEqual(["b"]);
	await hook.finish(844);
	expect(hook.pending).toHaveLength(0);

	// 内容变了（位图重截）：重量，期间沿用旧值，展开的 frame 不会先缩回去。
	hook.rerender({ frames, wanted: ["a", "b"], versions: { a: "r2", b: "r1" } });
	expect(hook.pending.map((entry) => entry.frameId)).toEqual(["a"]);
	expect(hook.heightOf("a")).toBe(6200);
	await hook.finish(5000);
	expect(hook.heightOf("a")).toBe(5000);
});

it("does not measure frames nobody asked about", () => {
	const hook = mountHook({ frames: [frame("a", 900)], wanted: [], versions: { a: "r1" } });
	expect(hook.pending).toHaveLength(0);
	expect(hook.heightOf("a")).toBeNull();
});
