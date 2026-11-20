import type { HeaderActionBarItem } from "@vetta-org/theme-ui/chat";
import { ChatHeaderActions } from "@vetta-org/theme-ui/chat/ChatHeaderActionsView";
import { ConversationHeaderActions } from "@domains/header-actions/ConversationHeaderActions";

interface NewSessionHeaderActionsProps {
	activityOpen: boolean;
	onToggleActivity: () => void;
	onTogglePin: () => void;
	panelTitle: string;
	pinTitle: string;
	pinned: boolean;
	/** 当前新会话页选中的项目目录；插件据此决定自己的动作出不出现。 */
	cwd?: string | null;
}

/**
 * 新会话页的标题栏右侧动作：窗口置顶、活动面板开关，以及声明了 `new-session` 的插件动作。
 * 此时还没有消息，因此不渲染导出、终端、底部面板这些面向已有会话的按钮。
 *
 * 与会话页共用同一个按钮组与同一套收纳 / 拖拽逻辑，只是布局单独存一份（见 layout-store）。
 */
export function NewSessionHeaderActions({
	activityOpen,
	onToggleActivity,
	onTogglePin,
	panelTitle,
	pinTitle,
	pinned,
	cwd = null,
}: NewSessionHeaderActionsProps): JSX.Element {
	const builtins: HeaderActionBarItem[] = [
		{
			key: "builtin:pin",
			title: pinTitle,
			active: pinned,
			promoteWhenActive: true,
			retainWhenNarrow: true,
			icon: <span className={pinned ? "icon-[solar--pin-bold]" : "icon-[solar--pin-linear]"} />,
			behavior: { type: "click", onClick: onTogglePin },
		},
	];
	return (
		<ConversationHeaderActions
			builtins={builtins}
			cwd={cwd}
			surface="new-session"
			pinned={<ChatHeaderActions.Panel title={panelTitle} open={activityOpen} onClick={onToggleActivity} />}
		/>
	);
}
