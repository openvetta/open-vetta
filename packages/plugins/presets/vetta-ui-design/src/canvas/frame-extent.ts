import { useCallback, useEffect, useRef, useState } from "react";
import type { VetdFrameEntry } from "../vetd/manifest-types";

/**
 * 展开 frame：标准尺寸装不下的页面（长落地页、带滚动的手机页），在画布上拉高到
 * 完整内容。
 *
 * 展开只是显示状态（manifest 里的 `expanded`），width/height 始终是标准设计尺寸。
 * 内容高度不落盘，每次内容变了就重新量——存下来的高度迟早过期，而且「过期的高度
 * 归谁说了算」本身就是一笔糊涂账。
 */

/** 内容比标准高度至少多出这么多才算装不下：吃掉亚像素取整之类的零头。 */
const EXPANDABLE_SLACK_PX = 2;

/** 标准尺寸装不下完整内容（量过才知道；没量过一律当装得下）。 */
export function isExpandable(frame: VetdFrameEntry, fullHeight: number | null): boolean {
	return fullHeight !== null && fullHeight > frame.height + EXPANDABLE_SLACK_PX;
}

/**
 * 画布显示用的 frame：展开且量到了内容高度的，高度换成内容高度；其余原样返回同一个
 * 引用（FrameView 走 memo，平白换引用会让它重渲染）。
 */
export function displayFrames(
	frames: readonly VetdFrameEntry[],
	fullHeightOf: (frameId: string) => number | null,
): VetdFrameEntry[] {
	return frames.map((frame) => {
		if (frame.expanded !== true) return frame;
		const full = fullHeightOf(frame.id);
		return full !== null && full > frame.height ? { ...frame, height: full } : frame;
	});
}

interface Extent {
	/** 量的时候 frame 的标准尺寸与内容版本；变了就要重量。 */
	key: string;
	height: number;
}

interface FrameExtentOptions {
	/** manifest 里的 frame（标准尺寸，不是显示尺寸）。 */
	frames: readonly VetdFrameEntry[];
	/** 需要知道内容高度的 frame：单独选中的那个（决定显不显示按钮），以及展开着的。 */
	wanted: readonly string[];
	/** 内容版本：变了就重量。画布用位图的引用——内容一变位图必然重截。 */
	versionOf(frameId: string): string | null;
	/** 量一次完整内容高度；宿主不支持离屏截图时为 null，整个功能不出现。 */
	measure: ((frame: VetdFrameEntry) => Promise<number>) | null;
}

function keyOf(frame: VetdFrameEntry, version: string | null): string {
	return `${frame.width}x${frame.height}|${version ?? ""}`;
}

/**
 * 按需量 frame 的完整内容高度，一次只量一个（离屏窗口是共享资源，没必要和位图队列抢）。
 * 返回查询函数：没量过的是 null；重量期间沿用上一次的值，展开的 frame 不会缩回去再弹开。
 */
export function useFrameExtents({ frames, wanted, versionOf, measure }: FrameExtentOptions): (frameId: string) => number | null {
	const [extents, setExtents] = useState<ReadonlyMap<string, Extent>>(new Map());
	/** 量失败的 key：同一份内容不再重试（免得页面构建失败时反复烧离屏窗口），内容变了再说。 */
	const failedRef = useRef(new Map<string, string>());
	const busyRef = useRef(false);
	const [settled, setSettled] = useState(0);

	useEffect(() => {
		if (measure === null || busyRef.current) return;
		for (const frameId of wanted) {
			const frame = frames.find((candidate) => candidate.id === frameId);
			if (!frame) continue;
			const key = keyOf(frame, versionOf(frameId));
			if (extents.get(frameId)?.key === key || failedRef.current.get(frameId) === key) continue;
			busyRef.current = true;
			void measure(frame)
				.then((height) => {
					setExtents((current) => new Map(current).set(frameId, { key, height: Math.round(height) }));
				})
				.catch((error: unknown) => {
					failedRef.current.set(frameId, key);
					console.warn(`[vetd] 量 ${frameId} 的内容高度失败`, error);
				})
				.finally(() => {
					busyRef.current = false;
					// 不管成败都让 effect 再跑一轮：排在后面的、或量的途中内容又变了的，接着量。
					setSettled((current) => current + 1);
				});
			return;
		}
	}, [frames, wanted, versionOf, measure, extents, settled]);

	return useCallback((frameId: string) => extents.get(frameId)?.height ?? null, [extents]);
}
