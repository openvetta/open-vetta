import type { PluginHeaderActionContext, PluginHeaderActionState } from "@vetta-org/plugin-sdk";
import { useTranslation } from "@vetta-org/plugin-sdk";
import { useCallback, useSyncExternalStore } from "react";
import { setPendingDesignPath } from "../canvas/design-runtime";
import { getPluginCtx } from "../plugin-context";
import { openCanvasTab } from "../canvas/open-canvas-tab";
import { CANVAS_TAB_ID } from "../tab-ids";
import { cachedDesignPaths, subscribeDesignPaths } from "../vetd/design-presence";

/** 与插件图标同一造型的线条稿：顶栏那颗图标需要能跟着主题变色。 */
export function DesignIcon({ className }: { className?: string }): JSX.Element {
	return (
		<svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
			<rect x="3" y="3" width="8" height="12" rx="1" />
			<rect x="14" y="6" width="7" height="9" rx="1" />
			<path d="M7 19h10" strokeLinecap="round" />
		</svg>
	);
}

/** `…/foo.vetd` → `foo`：下拉里只需要认得出来的名字。 */
export function designName(vetdPath: string): string {
	const base = vetdPath.replaceAll("\\", "/").split("/").pop() ?? vetdPath;
	return base.endsWith(".vetd") ? base.slice(0, -".vetd".length) : base;
}

/**
 * 打开画布并定位到某一份设计。
 *
 * 只是「把面板切到这页」不够：画布可能正开在另一份设计上，所以先把目标路径记进
 * pending（画布挂载时取走，已在挂载时由它的订阅取走），再铺开标签卡。
 */
export function openCanvasFor(cwd: string, vetdPath?: string): void {
	if (vetdPath) setPendingDesignPath(vetdPath, cwd);
	const ctx = getPluginCtx();
	ctx.ui.setActivityTabVisible(CANVAS_TAB_ID, true, { cwd });
	openCanvasTab(ctx.ui, cwd);
}

/**
 * 会话顶栏的「打开画布」：cwd 里有设计稿才出现，一份直接开，多份就列出来选。
 *
 * 列表来自会话切换时那次全量列举（见 design-presence），渲染期只读缓存——在顶栏
 * 按钮上跑 `listFilesRecursive` 会把整个工作区扫一遍，而它每秒都可能重渲染。
 */
/**
 * 从「有没有设计、有几份」推出顶栏那一格长什么样。抽成纯函数是因为分支不多但要判得准：
 * 一份直接开，多份必须给列表，零份则整格不出现。
 */
export function canvasActionState(options: {
	designs: readonly string[];
	open: (path?: string) => void;
	t: (key: string) => string;
}): PluginHeaderActionState | null {
	const { designs, open, t } = options;
	if (designs.length === 0) return null;
	const title = t("header.openCanvas");
	const icon = <DesignIcon className="h-4 w-4" />;
	if (designs.length === 1) {
		const only = designs[0] as string;
		return {
			title: `${title} · ${designName(only)}`,
			label: title,
			icon,
			onClick: () => open(only),
		};
	}
	return {
		title,
		label: title,
		icon,
		menuItems: designs.map((path) => ({
			id: path,
			label: designName(path),
			icon: <DesignIcon className="h-3.5 w-3.5" />,
			onSelect: () => open(path),
		})),
	};
}

/**
 * 会话顶栏的「打开画布」：cwd 里有设计稿才出现，一份直接开，多份就列出来选。
 *
 * 列表来自会话切换时那次全量列举（见 design-presence），渲染期只读缓存——在顶栏
 * 按钮上跑 `listFilesRecursive` 会把整个工作区扫一遍，而它每秒都可能重渲染。
 */
export function useCanvasHeaderAction(context: PluginHeaderActionContext): PluginHeaderActionState | null {
	const { t } = useTranslation();
	const cwd = context.cwd;
	const designs = useSyncExternalStore(
		subscribeDesignPaths,
		() => (cwd ? (cachedDesignPaths(cwd) ?? EMPTY) : EMPTY),
		() => EMPTY,
	);
	const open = useCallback(
		(path?: string) => {
			if (cwd) openCanvasFor(cwd, path);
		},
		[cwd],
	);
	return canvasActionState({ designs, open, t });
}

/** 稳定的空数组：`useSyncExternalStore` 的快照必须引用稳定，否则每次渲染都判为变化。 */
const EMPTY: string[] = [];
