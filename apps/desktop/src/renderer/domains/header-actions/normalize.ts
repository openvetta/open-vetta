import type { ComponentType, ReactNode } from "react";

/** 宿主对插件顶栏动作声明的上限，文档（`ui-slots.md`）里公开同一组数字。 */
export const HEADER_ACTION_LIMITS = {
	title: 40,
	menuItems: 20,
	menuLabel: 40,
} as const;

export interface NormalizedMenuItem {
	id: string;
	label: string;
	icon?: ReactNode;
	onSelect: () => void;
	disabled?: boolean;
	destructive?: boolean;
	separatorBefore?: boolean;
}

export type NormalizedBehavior =
	| { type: "click"; onClick: () => void }
	| { type: "menu"; items: NormalizedMenuItem[] }
	| { type: "popover"; component: ComponentType<{ close: () => void }> };

export interface NormalizedHeaderAction {
	title: string;
	icon: ReactNode;
	badge?: number | true;
	active: boolean;
	disabled: boolean;
	behavior: NormalizedBehavior;
}

function clip(text: string, max: number): string {
	const chars = Array.from(text.trim());
	return chars.length > max ? chars.slice(0, max).join("") : chars.join("");
}

function normalizeMenuItems(raw: unknown): NormalizedMenuItem[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	const items: NormalizedMenuItem[] = [];
	for (const entry of raw.slice(0, HEADER_ACTION_LIMITS.menuItems)) {
		if (entry === null || typeof entry !== "object") continue;
		const item = entry as Partial<NormalizedMenuItem>;
		if (typeof item.id !== "string" || item.id === "" || seen.has(item.id)) continue;
		if (typeof item.label !== "string" || item.label.trim() === "" || typeof item.onSelect !== "function") continue;
		seen.add(item.id);
		items.push({
			id: item.id,
			label: clip(item.label, HEADER_ACTION_LIMITS.menuLabel),
			icon: item.icon,
			onSelect: item.onSelect,
			disabled: item.disabled === true,
			destructive: item.destructive === true,
			separatorBefore: item.separatorBefore === true,
		});
	}
	return items;
}

/**
 * 把插件 `useAction()` 的返回值收成宿主能放心渲染的形态。
 *
 * 任何一项不合法都返回 `null`（该动作不显示）并带上原因，宿主据此打一条 warn；
 * 不抛错——声明写错只会让这一个动作消失。
 */
export function normalizeHeaderAction(raw: unknown): { value: NormalizedHeaderAction | null; problem?: string } {
	if (raw === null || raw === undefined) return { value: null };
	if (typeof raw !== "object") return { value: null, problem: "useAction() must return an object or null" };
	const state = raw as Record<string, unknown>;
	if (typeof state.title !== "string" || state.title.trim() === "") {
		return { value: null, problem: "`title` is required" };
	}
	if (state.icon === null || state.icon === undefined || state.icon === false) {
		return { value: null, problem: "`icon` is required" };
	}

	let behavior: NormalizedBehavior | null = null;
	const menu = normalizeMenuItems(state.menuItems);
	if (menu.length > 0) behavior = { type: "menu", items: menu };
	else if (typeof state.popover === "function" || (state.popover !== null && typeof state.popover === "object")) {
		behavior = { type: "popover", component: state.popover as ComponentType<{ close: () => void }> };
	} else if (typeof state.onClick === "function") behavior = { type: "click", onClick: state.onClick as () => void };
	if (!behavior) return { value: null, problem: "one of `onClick` / `menuItems` / `popover` is required" };

	let badge: number | true | undefined;
	if (state.badge === true) badge = true;
	else if (typeof state.badge === "number" && Number.isFinite(state.badge) && state.badge >= 1) {
		badge = Math.floor(state.badge);
	}

	return {
		value: {
			title: clip(state.title, HEADER_ACTION_LIMITS.title),
			icon: state.icon as ReactNode,
			badge,
			active: state.active === true,
			disabled: state.disabled === true,
			behavior,
		},
	};
}
