import { atom } from "jotai";

export type FilePreviewKind = "image" | "file";

export interface FilePreviewItem {
	/** 显示文件名（含扩展名） */
	name: string;
	/** 远程地址（聊天/流转附件入口使用），与 path 二选一 */
	url?: string;
	/** 本地文件绝对路径（文件树入口使用），与 url 二选一 */
	path?: string;
	/** 类型推断（旧字段，作为可选 hint 保留；分发逻辑改由扩展名决定） */
	kind?: FilePreviewKind;
	/** mime（可选） */
	mime?: string;
	/** 字节数（可选，文件下载详情显示） */
	size?: number;
}

export interface FilePreviewContext {
	items: FilePreviewItem[];
	index: number;
}

const filePreviewContextAtom = atom<FilePreviewContext | null>(null);

/**
 * 全局文件预览入口 atom。
 *
 * 写入兼容两种形态，方便旧调用方无需迁移：
 * - 单 item：自动包成只含一个元素的 context
 * - context：直接使用，可在 Dialog 内通过上一个/下一个切换
 *
 * 读取始终返回当前选中的 item。需要切换上下文请使用
 * {@link filePreviewIndexAtom}。
 */
export const filePreviewAtom = atom(
	(get) => {
		const ctx = get(filePreviewContextAtom);
		return ctx ? (ctx.items[ctx.index] ?? null) : null;
	},
	(_get, set, value: FilePreviewItem | FilePreviewContext | null) => {
		if (value === null) {
			set(filePreviewContextAtom, null);
			return;
		}
		if ("items" in value) {
			set(filePreviewContextAtom, value);
			return;
		}
		set(filePreviewContextAtom, { items: [value], index: 0 });
	},
);

/** 当前预览上下文（包含 items + index），用于 Dialog 内的切换。 */
export const filePreviewContextReadonlyAtom = atom(
	(get) => get(filePreviewContextAtom),
	(_get, set, ctx: FilePreviewContext | null) => set(filePreviewContextAtom, ctx),
);
