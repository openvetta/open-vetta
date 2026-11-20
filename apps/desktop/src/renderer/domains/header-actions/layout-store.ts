import type { PluginHeaderActionSurface } from "@vetta-org/plugin-sdk";
import { atom } from "jotai";
import type { HeaderLayout } from "./layout";

/**
 * 本机存储键约定：`vetta-header-action-layout` 属于会话页（沿用旧键，用户已有布局不丢），
 * 其余页面加后缀。布局按页面隔离——在会话里排好的顺序不该决定新会话页长什么样。
 */
export function headerActionLayoutStorageKey(surface: PluginHeaderActionSurface): string {
	return surface === "conversation" ? "vetta-header-action-layout" : `vetta-header-action-layout:${surface}`;
}

export function parseHeaderLayout(raw: string | null): HeaderLayout | null {
	if (!raw) return null;
	try {
		const value = JSON.parse(raw) as { top?: unknown; tray?: unknown };
		const isKeys = (list: unknown): list is string[] =>
			Array.isArray(list) && list.every((key) => typeof key === "string");
		if (!isKeys(value.top) || !isKeys(value.tray)) return null;
		return { top: value.top, tray: value.tray };
	} catch {
		return null;
	}
}

function readStored(surface: PluginHeaderActionSurface): HeaderLayout | null {
	try {
		return parseHeaderLayout(localStorage.getItem(headerActionLayoutStorageKey(surface)));
	} catch {
		return null;
	}
}

const atoms = new Map<PluginHeaderActionSurface, ReturnType<typeof createLayoutAtom>>();

function createLayoutAtom(surface: PluginHeaderActionSurface) {
	const baseAtom = atom<HeaderLayout | null>(readStored(surface));
	return atom(
		(get) => get(baseAtom),
		(_get, set, next: HeaderLayout | null) => {
			set(baseAtom, next);
			try {
				const key = headerActionLayoutStorageKey(surface);
				if (next) localStorage.setItem(key, JSON.stringify(next));
				else localStorage.removeItem(key);
			} catch {
				// 存储不可用（隐私模式等）时本次会话内仍然生效。
			}
		},
	);
}

/**
 * 某个页面的顶栏布局；`null` 表示该页从没调整过（全部走默认顺序）。写入同时落到 localStorage。
 * 同一个页面反复取到同一个 atom，订阅关系不会因为重渲染而断。
 */
export function headerActionLayoutAtomFor(surface: PluginHeaderActionSurface) {
	const existing = atoms.get(surface);
	if (existing) return existing;
	const created = createLayoutAtom(surface);
	atoms.set(surface, created);
	return created;
}

/** 会话页的布局；保留这个名字供既有调用方与测试直接使用。 */
export const headerActionLayoutAtom = headerActionLayoutAtomFor("conversation");
