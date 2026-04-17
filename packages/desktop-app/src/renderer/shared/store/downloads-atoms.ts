import type { DownloadItem } from "@preload/api";
import { atom } from "jotai";

/** 全局：所有下载项 (id → item)，按 createdAt 倒序使用时再排 */
export const downloadsMapAtom = atom<Map<string, DownloadItem>>(new Map());

/** 派生：按时间倒序的列表 */
export const downloadsListAtom = atom((get) => {
	const m = get(downloadsMapAtom);
	return Array.from(m.values()).sort((a, b) => b.createdAt - a.createdAt);
});

/** 派生：进行中的数量（用于侧边栏角标） */
export const downloadsActiveCountAtom = atom((get) => {
	const m = get(downloadsMapAtom);
	let n = 0;
	for (const it of m.values()) {
		if (it.status === "downloading" || it.status === "queued") n++;
	}
	return n;
});
