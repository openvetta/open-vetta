import type { ChatMember } from "@shared/lib/api";
import { ChatMembersBarView } from "@vetta/theme-ui/flowing-chat";

interface ChatMembersBarProps {
	members: ChatMember[];
	currentUserId: number;
	onMention: (member: ChatMember) => void;
}

/**
 * 聊天面板顶部固定的成员头像栏。
 * 右键单个头像即触发 @ 提及。
 */
export function ChatMembersBar({ members, currentUserId, onMention }: ChatMembersBarProps): JSX.Element {
	return (
		<ChatMembersBarView
			members={members}
			currentUserId={currentUserId}
			onMention={onMention}
			labels={{
				empty: "暂无成员",
				meSuffix: "（你）",
				mentionHintSuffix: "（右键 @ 提及）",
			}}
		/>
	);
}
