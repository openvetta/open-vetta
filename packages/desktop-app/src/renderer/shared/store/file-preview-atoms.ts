import { atom } from "jotai";

export type FilePreviewKind = "image" | "file";

export interface FilePreviewItem {
	/** 显示文件名（含扩展名） */
	name: string;
	/** 远程地址（含鉴权 query 参数）。点击下载时使用 */
	url: string;
	/** 类型推断 */
	kind: FilePreviewKind;
	/** mime（可选） */
	mime?: string;
	/** 字节数（可选，文件下载详情显示） */
	size?: number;
}

export const filePreviewAtom = atom<FilePreviewItem | null>(null);
