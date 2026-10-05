import { atom } from "jotai";
import {
	ACTIVITY_PANEL_DEFAULT_WIDTH,
	ACTIVITY_PANEL_PREVIEW_MIN_WIDTH,
	activityPanelWidthAtom,
	setActivityPanelWidthAtom,
} from "./activity-atoms";

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
	(get, set, ctx: FilePreviewContext | null | ((prev: FilePreviewContext | null) => FilePreviewContext | null)) =>
		set(filePreviewContextAtom, typeof ctx === "function" ? ctx(get(filePreviewContextAtom)) : ctx),
);

/**
 * 内嵌（活动面板内）文件预览上下文。
 *
 * 与全局 Dialog 形态的 {@link filePreviewAtom} 区分：当此 atom 非空时，
 * 文件预览显示在侧栏内（宽栏分屏、窄栏切换），而不是弹出 Dialog。
 * 文件树（FilesPanel）走这条路径；聊天附件等其他入口仍走 Dialog。
 */
const inlineFilePreviewContextAtom = atom<FilePreviewContext | null>(null);

export const inlineFilePreviewAtom = atom(
	(get) => {
		const ctx = get(inlineFilePreviewContextAtom);
		return ctx ? (ctx.items[ctx.index] ?? null) : null;
	},
	(_get, set, value: FilePreviewItem | FilePreviewContext | null) => {
		if (value === null) {
			set(inlineFilePreviewContextAtom, null);
			return;
		}
		if ("items" in value) {
			set(inlineFilePreviewContextAtom, value);
			return;
		}
		set(inlineFilePreviewContextAtom, { items: [value], index: 0 });
	},
);

export const inlineFilePreviewContextReadonlyAtom = atom(
	(get) => get(inlineFilePreviewContextAtom),
	(_get, set, ctx: FilePreviewContext | null) => set(inlineFilePreviewContextAtom, ctx),
);

/** 内嵌预览展开前的面板宽度，用于关闭/离开时回拉。null 表示当前不是「主动点开」拉宽的。 */
const inlinePreviewRestoreWidthAtom = atom<number | null>(null);

/** 上下文文件链接保留当前面板宽度；文件树的主动打开仍使用展开/回拉行为。 */
const inlinePreviewWidthBehaviorAtom = atom<"expand" | "preserve">("expand");
export const inlineFilePreviewPreservesWidthAtom = atom((get) => get(inlinePreviewWidthBehaviorAtom) === "preserve");

/** 用户关闭预览后，直到再次拖窄或主动打开前，不自动选中首个文件。 */
export const inlinePreviewAutoOpenSuppressedAtom = atom(false);

/**
 * 文件树主动点开时记住当前宽度（仅首次）并拉到 max；上下文链接传 preserve 保留宽度。
 */
export const openInlineFilePreviewAtom = atom(
	null,
	(get, set, value: FilePreviewItem | FilePreviewContext, widthBehavior: "expand" | "preserve" = "expand") => {
		set(inlinePreviewWidthBehaviorAtom, widthBehavior);
		set(inlinePreviewAutoOpenSuppressedAtom, false);
		if (widthBehavior === "preserve") {
			// 接管已有预览时也清除旧的回拉记录，关闭时不再覆盖用户当前宽度。
			set(inlinePreviewRestoreWidthAtom, null);
		} else {
			if (get(inlinePreviewRestoreWidthAtom) === null) {
				set(inlinePreviewRestoreWidthAtom, get(activityPanelWidthAtom));
			}
			set(setActivityPanelWidthAtom, "max");
		}
		set(inlineFilePreviewAtom, value);
	},
);

/**
 * 关闭、离开文件 tab 或切换 session 时清空预览；只有展开型入口回拉宽度。
 */
export const closeInlineFilePreviewAtom = atom(null, (get, set) => {
	const hadPreview = get(inlineFilePreviewContextAtom) !== null;
	const preserveWidth = get(inlineFilePreviewPreservesWidthAtom);
	set(inlineFilePreviewAtom, null);
	const restore = get(inlinePreviewRestoreWidthAtom);
	set(inlinePreviewRestoreWidthAtom, null);
	set(inlinePreviewWidthBehaviorAtom, "expand");
	if (hadPreview) set(inlinePreviewAutoOpenSuppressedAtom, true);
	if (preserveWidth) return;
	// 从未打开过内嵌预览（既无主动点开记录、当前也无预览上下文）时不碰宽度——否则切走文件
	// tab 的卸载清理会把其它来源（如插件 openActivityTab 拉到 max）刚设的宽度误重置为默认。
	if (!hadPreview && restore === null) return;
	// 关闭后必须把面板收到阈值以下，否则「宽度驱动」会立刻又自动选中第一个文件。
	// 主动点开的回拉到点开前宽度；纯靠拖宽触发的（无记录）回拉到默认宽度。
	const target =
		restore !== null && restore < ACTIVITY_PANEL_PREVIEW_MIN_WIDTH ? restore : ACTIVITY_PANEL_DEFAULT_WIDTH;
	if (get(activityPanelWidthAtom) >= ACTIVITY_PANEL_PREVIEW_MIN_WIDTH) {
		set(setActivityPanelWidthAtom, target);
	}
});
