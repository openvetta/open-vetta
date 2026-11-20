import type { ComponentType, ReactNode } from "react";

/** 宿主对插件顶栏动作声明的上限，文档（`ui-slots.md`）里公开同一组数字。 */
export const HEADER_ACTION_LIMITS = {
	title: 40,
	label: 24,
	menuItems: 20,
	menuLabel: 40,
	/** 子菜单只允许一层：再深就该换成一个能搜索的列表，别在顶栏里做树。 */
	menuDepth: 1,
} as const;

export type HeaderActionTone = "neutral" | "info" | "success" | "warning" | "danger";

const TONES = new Set<HeaderActionTone>(["neutral", "info", "success", "warning", "danger"]);

export type NormalizedMenuItemKind = "item" | "checkbox" | "radio" | "label" | "loading" | "empty" | "submenu";

const MENU_KINDS = new Set<NormalizedMenuItemKind>([
	"item",
	"checkbox",
	"radio",
	"label",
	"loading",
	"empty",
	"submenu",
]);

export interface NormalizedMenuItem {
	id: string;
	kind: NormalizedMenuItemKind;
	label: string;
	icon?: ReactNode;
	onSelect?: () => void;
	children?: NormalizedMenuItem[];
	checked?: boolean;
	disabled?: boolean;
	disabledReason?: string;
	destructive?: boolean;
	separatorBefore?: boolean;
}

export type HeaderActionPopoverSize = "sm" | "md" | "lg";
export type HeaderActionPopoverHost = "popover" | "dialog";

export interface NormalizedPopover {
	component: ComponentType<{ close: () => void }>;
	size: HeaderActionPopoverSize;
	host: HeaderActionPopoverHost;
	dialogTitle?: string;
}

export type NormalizedBehavior =
	| { type: "click"; onClick: () => void }
	| { type: "menu"; items: NormalizedMenuItem[] }
	| { type: "popover"; popover: NormalizedPopover };

export interface NormalizedHeaderAction {
	title: string;
	icon: ReactNode;
	label?: string;
	badge?: number | true;
	tone?: HeaderActionTone;
	active: boolean;
	disabled: boolean;
	disabledReason?: string;
	promoteWhenActive: boolean;
	behavior: NormalizedBehavior;
}

function clip(text: string, max: number): string {
	const chars = Array.from(text.trim());
	return chars.length > max ? chars.slice(0, max).join("") : chars.join("");
}

function normalizeMenuItems(raw: unknown, depth = 0): NormalizedMenuItem[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	const items: NormalizedMenuItem[] = [];
	for (const entry of raw.slice(0, HEADER_ACTION_LIMITS.menuItems)) {
		if (entry === null || typeof entry !== "object") continue;
		const item = entry as Record<string, unknown>;
		if (typeof item.id !== "string" || item.id === "" || seen.has(item.id)) continue;
		if (typeof item.label !== "string" || item.label.trim() === "") continue;

		const kind = (
			typeof item.kind === "string" && MENU_KINDS.has(item.kind as NormalizedMenuItemKind) ? item.kind : "item"
		) as NormalizedMenuItemKind;
		const onSelect = typeof item.onSelect === "function" ? (item.onSelect as () => void) : undefined;
		// 子菜单只认 children；其余可点类型必须有 onSelect，否则这一项点了没反应。
		const children =
			kind === "submenu" && depth < HEADER_ACTION_LIMITS.menuDepth
				? normalizeMenuItems(item.children, depth + 1)
				: undefined;
		const interactive = kind === "item" || kind === "checkbox" || kind === "radio";
		if (interactive && !onSelect) continue;
		if (kind === "submenu" && (!children || children.length === 0)) continue;

		seen.add(item.id);
		items.push({
			id: item.id,
			kind,
			label: clip(item.label, HEADER_ACTION_LIMITS.menuLabel),
			icon: item.icon as ReactNode,
			onSelect,
			...(children ? { children } : {}),
			...(kind === "checkbox" || kind === "radio" ? { checked: item.checked === true } : {}),
			disabled: kind === "loading" || kind === "empty" || item.disabled === true,
			...(typeof item.disabledReason === "string" && item.disabledReason.trim() !== ""
				? { disabledReason: clip(item.disabledReason, HEADER_ACTION_LIMITS.title) }
				: {}),
			destructive: item.destructive === true,
			separatorBefore: item.separatorBefore === true,
		});
	}
	return items;
}

/**
 * 气泡声明有两种写法：直接给组件，或 `{ component, size, host, title }`。两种都收成同一个形状，
 * 渲染层不必再分支。
 */
function normalizePopover(raw: unknown): NormalizedPopover | null {
	const isComponent = (value: unknown): value is ComponentType<{ close: () => void }> =>
		typeof value === "function" || (value !== null && typeof value === "object" && "$$typeof" in (value as object));

	if (isComponent(raw)) return { component: raw, size: "md", host: "popover" };
	if (raw === null || typeof raw !== "object") return null;
	const options = raw as Record<string, unknown>;
	if (!isComponent(options.component)) return null;
	const size: HeaderActionPopoverSize = options.size === "sm" || options.size === "lg" ? options.size : "md";
	return {
		component: options.component,
		size,
		host: options.host === "dialog" ? "dialog" : "popover",
		...(typeof options.title === "string" && options.title.trim() !== ""
			? { dialogTitle: clip(options.title, HEADER_ACTION_LIMITS.title) }
			: {}),
	};
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
	const popover = normalizePopover(state.popover);
	if (menu.length > 0) behavior = { type: "menu", items: menu };
	else if (popover) behavior = { type: "popover", popover };
	else if (typeof state.onClick === "function") behavior = { type: "click", onClick: state.onClick as () => void };
	if (!behavior) return { value: null, problem: "one of `onClick` / `menuItems` / `popover` is required" };

	let badge: number | true | undefined;
	if (state.badge === true) badge = true;
	else if (typeof state.badge === "number" && Number.isFinite(state.badge) && state.badge >= 1) {
		badge = Math.floor(state.badge);
	}

	const tone =
		typeof state.tone === "string" && TONES.has(state.tone as HeaderActionTone)
			? (state.tone as HeaderActionTone)
			: undefined;
	const disabled = state.disabled === true;
	const disabledReason =
		disabled && typeof state.disabledReason === "string" && state.disabledReason.trim() !== ""
			? clip(state.disabledReason, HEADER_ACTION_LIMITS.title)
			: undefined;
	const label =
		typeof state.label === "string" && state.label.trim() !== ""
			? clip(state.label, HEADER_ACTION_LIMITS.label)
			: undefined;

	return {
		value: {
			title: clip(state.title, HEADER_ACTION_LIMITS.title),
			icon: state.icon as ReactNode,
			...(label ? { label } : {}),
			badge,
			...(tone && tone !== "neutral" ? { tone } : {}),
			active: state.active === true,
			disabled,
			...(disabledReason ? { disabledReason } : {}),
			promoteWhenActive: state.promoteWhenActive === true,
			behavior,
		},
	};
}

/** 图标节点的签名：同类型、同属性视为同一个图标；序列化失败时每次都当成「变了」，宁可多发布也不漏。 */
function iconSignature(icon: ReactNode, fallback: () => string): string {
	if (icon === null || icon === undefined || icon === false) return "";
	if (typeof icon === "string" || typeof icon === "number") return `t:${icon}`;
	if (icon !== null && typeof icon === "object" && "type" in icon && "props" in icon) {
		const element = icon as { type: unknown; props: unknown };
		const type =
			typeof element.type === "string"
				? element.type
				: typeof element.type === "function"
					? element.type.name || "fn"
					: "?";
		try {
			return `e:${type}:${JSON.stringify(element.props)}`;
		} catch {
			return fallback();
		}
	}
	return fallback();
}

let fallbackCounter = 0;

/**
 * 一次声明里「会改变屏幕上画面」的那部分内容的签名：标题、图标、角标、颜色、选中 / 禁用 / 禁用原因、
 * 点击行为的种类与菜单项文案。回调（`onClick` / `onSelect`）不在其中——它们由调用方通过 ref 始终
 * 指向最新的，不需要为此重新发布。
 * 探针据此判断「声明没变」就不再通知按钮组，避免插件每次重渲染（流式期间很频繁）都带动整个按钮组重渲。
 */
export function headerActionSignature(
	action: NormalizedHeaderAction,
	popoverId: (component: object) => number,
): string {
	const { behavior } = action;
	const behaviorPart =
		behavior.type === "menu"
			? `menu:${menuSignature(behavior.items)}`
			: behavior.type === "popover"
				? `popover:${popoverId(behavior.popover.component)}:${behavior.popover.size}:${behavior.popover.host}:${behavior.popover.dialogTitle ?? ""}`
				: "click";
	return [
		action.title,
		action.label ?? "",
		iconSignature(action.icon, () => `i${fallbackCounter++}`),
		action.badge ?? "",
		action.tone ?? "",
		action.active ? 1 : 0,
		action.disabled ? 1 : 0,
		action.disabledReason ?? "",
		action.promoteWhenActive ? 1 : 0,
		behaviorPart,
	].join("\u0001");
}

function menuSignature(items: readonly NormalizedMenuItem[]): string {
	return items
		.map((item) => {
			const flags = `${item.disabled ? 1 : 0}${item.destructive ? 1 : 0}${item.separatorBefore ? 1 : 0}${item.checked ? 1 : 0}`;
			const children = item.children ? `[${menuSignature(item.children)}]` : "";
			return `${item.id}|${item.kind}|${item.label}|${flags}|${item.disabledReason ?? ""}|${iconSignature(item.icon, () => `m${fallbackCounter++}`)}${children}`;
		})
		.join(";");
}
