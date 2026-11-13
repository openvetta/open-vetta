import { useTranslation } from "react-i18next";
import { ButtonGroupItem } from "@vetta-org/ui/button-group";
import { useNewChatNavigation } from "../../../project/hooks/useNewChatNavigation";

/**
 * 会话页顶栏「新会话」入口。作为 `pageHeaderLeftActionsAtom` 的内容，与「展开侧边栏」
 * 合成同一个按钮组；顶栏只在侧边栏不可见（收起或窄屏浮层）时才渲染这个组，
 * 行为等同侧边栏导航的「新会话」。
 */
export function ChatHeaderNewSessionButton({
	onClick,
	title: titleOverride,
}: {
	readonly onClick?: () => void;
	readonly title?: string;
} = {}): JSX.Element {
	const { t } = useTranslation("chat");
	const onNewChat = useNewChatNavigation();
	const title = titleOverride ?? t("chatView.newSessionButton.title");
	return (
		<ButtonGroupItem
			title={title}
			aria-label={title}
			onClick={onClick ?? onNewChat}
			icon={<span className="icon-[solar--pen-new-square-linear] h-4 w-4" />}
		/>
	);
}
