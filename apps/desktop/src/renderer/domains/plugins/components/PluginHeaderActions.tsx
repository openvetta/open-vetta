import { pluginHeaderActionsAtom } from "@shared/store/plugin-atoms";
import { useAtomValue } from "jotai";
import type { JSX } from "react";
import { HeaderSlot } from "./WorkspaceViewHeaderSlot";

/**
 * 会话页顶栏里插件贡献的一排动作，放在内置按钮组的左侧。
 *
 * 间距由宿主统一决定，插件无法覆盖：项与项之间 `gap-2`，整排与内置按钮组之间再让出
 * `mr-1`（顶栏本身有 4px，合计 8px）。某一项组件返回 `null` 时它的容器 `:empty`，
 * 随之 `hidden`，连同它的间距一起收起；所有项都为空时整排也不占位（`has-[>:not(:empty)]`）。
 * 每一项都包在错误边界和插件 i18n 作用域里，一个插件出错只会让它自己消失。
 */
export function PluginHeaderActions(): JSX.Element | null {
	const actions = useAtomValue(pluginHeaderActionsAtom);
	if (actions.length === 0) return null;
	return (
		<div
			data-plugin-header-actions="true"
			className="mr-1 hidden shrink-0 items-center gap-2 has-[>:not(:empty)]:flex"
		>
			{actions.map(({ actionId, pluginId, component: Component }) => (
				<div key={actionId} data-plugin-header-action={actionId} className="flex items-center empty:hidden">
					<HeaderSlot pluginId={pluginId} slotKey={actionId}>
						<Component />
					</HeaderSlot>
				</div>
			))}
		</div>
	);
}
