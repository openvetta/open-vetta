import { type JSX, type ReactNode, createElement, memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { type PrimitiveAtom, atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import type { PluginHeaderActionContext, PluginHeaderActionSurface } from "@vetta-org/plugin-sdk";
import { type HeaderActionBarItem, HeaderActionBarView, type HeaderActionZone } from "@vetta-org/theme-ui/chat";
import { HeaderSlot } from "@domains/plugins/components/WorkspaceViewHeaderSlot";
import { type RegisteredHeaderAction, pluginHeaderActionsAtom } from "@shared/store/plugin-atoms";
import { DEFAULT_TOP_ACTIONS_BY_SURFACE, MAX_TOP_ACTIONS, moveHeaderAction, resolveHeaderLayout } from "./layout";
import { headerActionLayoutAtomFor } from "./layout-store";
import { type NormalizedHeaderAction, headerActionSignature, normalizeHeaderAction } from "./normalize";

/** 插件回调抛错（含异步）只记日志，不能冒到宿主的事件处理里去。 */
function guarded(pluginId: string, fn: () => unknown): () => void {
	return () => {
		try {
			const result = fn();
			if (result instanceof Promise) result.catch((error) => console.error(`Plugin header action failed: ${pluginId}`, error));
		} catch (error) {
			console.error(`Plugin header action failed: ${pluginId}`, error);
		}
	};
}

/**
 * 把规范化后的声明变成按钮组的一项。回调不直接捕获某一次渲染的函数，而是通过 `latest` 读最新一次声明：
 * 声明内容没变时探针不会重新发布（见 `headerActionSignature`），已经发布出去的项点击时仍要调到最新的回调。
 */
function toBarItem(
	action: RegisteredHeaderAction,
	value: NormalizedHeaderAction,
	latest: { current: NormalizedHeaderAction },
): HeaderActionBarItem {
	const { behavior } = value;
	const common = {
		key: action.actionId,
		title: value.title,
		icon: value.icon,
		...(value.label ? { label: value.label } : {}),
		badge: value.badge,
		...(value.tone ? { tone: value.tone } : {}),
		active: value.active,
		disabled: value.disabled,
		...(value.disabledReason ? { disabledReason: value.disabledReason } : {}),
		...(value.promoteWhenActive ? { promoteWhenActive: true } : {}),
	};
	if (behavior.type === "menu") {
		return {
			...common,
			behavior: {
				type: "menu",
				items: behavior.items.map((item) => ({
					...item,
					onSelect: guarded(action.pluginId, () => {
						const current = latest.current.behavior;
					if (current.type === "menu") current.items.find((entry) => entry.id === item.id)?.onSelect?.();
					}),
				})),
			},
		};
	}
	if (behavior.type === "popover") {
		const popover = behavior.popover;
		return {
			...common,
			behavior: {
				type: "popover",
				size: popover.size,
				host: popover.host,
				...(popover.dialogTitle ? { dialogTitle: popover.dialogTitle } : {}),
				// 气泡内容在宿主浮层里渲染，要放回插件自己的 i18n 目录与 CSS 作用域，并隔离它的错误。
				render: (api) => {
					const current = latest.current.behavior;
					if (current.type !== "popover") return null;
					return (
						<HeaderSlot pluginId={action.pluginId} slotKey={`${action.actionId}:popover`}>
							{createElement(current.popover.component, { close: api.close })}
						</HeaderSlot>
					);
				},
			},
		};
	}
	return {
		...common,
		behavior: {
			type: "click",
			onClick: guarded(action.pluginId, () => {
				const current = latest.current.behavior;
				if (current.type === "click") current.onClick();
			}),
		},
	};
}

// 同一个贡献被重新注册（插件热重载）时 hook 函数会变：用它换 key，让 React 重建探针，
// 否则同一个组件实例前后调用了不同的 hook 序列会直接报错。
const hookIds = new WeakMap<object, number>();
let nextHookId = 0;
function hookId(fn: object): number {
	let id = hookIds.get(fn);
	if (id === undefined) {
		id = nextHookId++;
		hookIds.set(fn, id);
	}
	return id;
}

/**
 * 一个插件动作的「探针」：在宿主里调用插件的 `useAction()` hook，把声明校验后发布给按钮组。
 * 不渲染任何内容。发布走独立的 atom，探针所在的父级不订阅它——否则「发布 → 父级更新 →
 * i18n 作用域换了 context 值 → 探针重渲染 → 再发布」会死循环（Maximum update depth exceeded）。
 */
const ActionProbe = memo(function ActionProbe({
	action,
	context,
	onItem,
}: {
	readonly action: RegisteredHeaderAction;
	readonly context: PluginHeaderActionContext;
	readonly onItem: (key: string, item: HeaderActionBarItem | null) => void;
}): null {
	const raw = action.useAction(context);
	const { value, problem } = normalizeHeaderAction(raw);
	const warned = useRef<string | null>(null);
	if (problem && warned.current !== problem) {
		warned.current = problem;
		console.warn(`Plugin header action ignored: ${action.actionId} — ${problem}`);
	}
	const latest = useRef(value);
	if (value) latest.current = value;
	const signature = value ? headerActionSignature(value, hookId) : null;
	const published = useRef<string | null | undefined>(undefined);
	useLayoutEffect(() => {
		// 声明没变就不通知按钮组：插件每次重渲染（比如流式期间）都会走到这里，不去重的话每次都会让整排按钮重渲。
		if (published.current === signature) return;
		published.current = signature;
		onItem(action.actionId, value ? toBarItem(action, value, latest as { current: NormalizedHeaderAction }) : null);
	});
	useLayoutEffect(
		() => () => {
			onItem(action.actionId, null);
			// 卸载后（含 StrictMode 的卸载再挂载）要能重新发布。
			published.current = undefined;
		},
		[action.actionId, onItem],
	);
	return null;
});

type PluginItems = Readonly<Record<string, HeaderActionBarItem>>;

/** 所有探针放在这里，只依赖已注册的动作列表；外面的 props 变化（内置按钮重算）不会波及它们。 */
const ProbeHost = memo(function ProbeHost({
	registered,
	context,
	itemsAtom,
}: {
	readonly registered: readonly RegisteredHeaderAction[];
	readonly context: PluginHeaderActionContext;
	readonly itemsAtom: PrimitiveAtom<PluginItems>;
}): JSX.Element {
	const setItems = useSetAtom(itemsAtom);
	const onItem = useCallback(
		(key: string, item: HeaderActionBarItem | null) => {
			setItems((previous) => {
				if (item === null) {
					if (!(key in previous)) return previous;
					const { [key]: _removed, ...rest } = previous;
					return rest;
				}
				return { ...previous, [key]: item };
			});
		},
		[setItems],
	);
	return (
		<div hidden aria-hidden="true" data-header-action-probes="true">
			{registered.map((action) => (
				<HeaderSlot key={`${action.actionId}#${hookId(action.useAction)}`} pluginId={action.pluginId} slotKey={action.actionId}>
					<ActionProbe action={action} context={context} onItem={onItem} />
				</HeaderSlot>
			))}
		</div>
	);
});

export interface ConversationHeaderActionsProps {
	/** 宿主内置的动作，已按默认顺序排好；key 形如 `builtin:export`。 */
	readonly builtins: readonly HeaderActionBarItem[];
	/** 固定在最右、不参与排序与收纳的一格（活动面板开关）。 */
	readonly pinned: ReactNode;
}

export interface ConversationHeaderActionsProps {
	/** 宿主内置的动作，已按默认顺序排好；key 形如 `builtin:export`。 */
	readonly builtins: readonly HeaderActionBarItem[];
	/** 固定在最右、不参与排序与收纳的一格（活动面板开关）。 */
	readonly pinned: ReactNode;
	/** 当前页面；决定哪些插件动作出现，也决定布局存在哪一份。默认会话页。 */
	readonly surface?: PluginHeaderActionSurface;
	/** 交给插件 `useAction` 的当前工作目录。 */
	readonly cwd?: string | null;
}

/**
 * 会话页与新会话页顶栏右侧的统一按钮组：内置动作与插件动作合进同一个列表，按用户存下来的布局
 * 排出顶栏与收纳两部分（规则见 `layout.ts`）。
 */
export function ConversationHeaderActions({
	builtins,
	pinned,
	surface = "conversation",
	cwd = null,
}: ConversationHeaderActionsProps): JSX.Element {
	const registered = useAtomValue(pluginHeaderActionsAtom);
	// 每次挂载一份：页面卸载后插件探针的发布不会残留到下一次。
	const itemsAtom = useMemo(() => atom<PluginItems>({}), []);
	// 没声明 `surfaces` 的动作视为只在会话页出现（2.11.0 之前的行为）。
	const visible = useMemo(
		() => registered.filter((action) => (action.surfaces ?? (["conversation"] as const)).includes(surface)),
		[registered, surface],
	);
	const context = useMemo<PluginHeaderActionContext>(() => ({ surface, cwd: cwd ?? null }), [surface, cwd]);
	return (
		<>
			<ProbeHost registered={visible} context={context} itemsAtom={itemsAtom} />
			<HeaderActionBar
				registered={visible}
				itemsAtom={itemsAtom}
				builtins={builtins}
				pinned={pinned}
				surface={surface}
				cwd={cwd}
			/>
		</>
	);
}

function HeaderActionBar({
	registered,
	itemsAtom,
	builtins,
	pinned,
	surface = "conversation",
}: ConversationHeaderActionsProps & {
	readonly registered: readonly RegisteredHeaderAction[];
	readonly itemsAtom: PrimitiveAtom<PluginItems>;
}): JSX.Element {
	const { t } = useTranslation("chat");
	const pluginItems = useAtomValue(itemsAtom);
	const [saved, setSaved] = useAtom(headerActionLayoutAtomFor(surface));

	const { items, defaultOrder, preferredTop } = useMemo(() => {
		const byKey = new Map<string, HeaderActionBarItem>();
		const order: string[] = [];
		// 默认顺序：插件在前（离内置更远），内置在后；返回 null（此刻不适用）的插件动作不进布局、不占名额。
		for (const action of registered) {
			const item = pluginItems[action.actionId];
			if (!item) continue;
			byKey.set(item.key, item);
			order.push(item.key);
		}
		// 声明 `pin: "prefer"` 的动作（“状态就该看得见”那一类）请求在用户没调整过时上顶栏。
		const preferred = registered
			.filter((action) => action.pin === "prefer" && pluginItems[action.actionId])
			.map((action) => action.actionId);
		for (const item of builtins) {
			byKey.set(item.key, item);
			order.push(item.key);
		}
		return { items: byKey, defaultOrder: order, preferredTop: preferred };
	}, [builtins, pluginItems, registered]);

	const layout = useMemo(() => {
		// 默认顶栏 = 该页面的内置默认那几格 + 请求优先上栏的插件动作；7 格上限与用户调整由 resolveHeaderLayout 处理。
		const defaultTop = [...(DEFAULT_TOP_ACTIONS_BY_SURFACE[surface] ?? []), ...preferredTop];
		return resolveHeaderLayout(defaultOrder, saved, MAX_TOP_ACTIONS, defaultTop);
	}, [defaultOrder, preferredTop, saved, surface]);

	const onMove = useCallback(
		(key: string, zone: HeaderActionZone, index: number) => {
			const next = moveHeaderAction(layout, key, zone, index, saved);
			if (next) setSaved(next);
		},
		[layout, saved, setSaved],
	);

	const pick = (keys: readonly string[]): HeaderActionBarItem[] =>
		keys.flatMap((key) => {
			const item = items.get(key);
			return item ? [item] : [];
		});
	const top = pick(layout.top);
	const tray = pick(layout.tray);

	const labels = {
		customize: t("chatView.headerActions.customize"),
		topFull: t("chatView.headerActions.topFull"),
		moveToTop: t("chatView.headerActions.moveToTop"),
		moveToTray: t("chatView.headerActions.moveToTray"),
		adjust: t("chatView.headerActions.adjust"),
		done: t("chatView.headerActions.done"),
		more: t("chatView.headerActions.more"),
	};

	return (
		<HeaderActionBarView top={top} tray={tray} pinned={pinned} maxTop={MAX_TOP_ACTIONS} labels={labels} onMove={onMove} />
	);
}
