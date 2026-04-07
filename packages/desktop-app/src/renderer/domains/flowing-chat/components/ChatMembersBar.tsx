import type { ChatMember } from "@shared/lib/api";
import { cn } from "@shared/lib/utils";

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
	if (members.length === 0) {
		return (
			<div className="flex h-10 items-center justify-center border-b border-border/60 px-3 text-[10px] text-muted-foreground/40">
				暂无成员
			</div>
		);
	}
	return (
		<div className="flex h-10 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border/60 px-2">
			<span className="shrink-0 text-[10px] text-muted-foreground/50">成员 {members.length}</span>
			<div className="flex items-center gap-1.5">
				{members.map((m) => (
					<button
						key={m.id}
						type="button"
						onContextMenu={(e) => {
							e.preventDefault();
							if (m.id === currentUserId) return;
							onMention(m);
						}}
						title={`${m.username}${m.id === currentUserId ? "（你）" : "（右键 @ 提及）"}`}
						className={cn(
							"relative shrink-0 rounded-full transition-transform hover:scale-110",
							m.id === currentUserId && "ring-1 ring-primary/40",
						)}
					>
						<MemberAvatar name={m.username} url={m.avatar} />
					</button>
				))}
			</div>
		</div>
	);
}

function MemberAvatar({ name, url }: { name: string; url: string }): JSX.Element {
	if (url) {
		return <img src={url} alt={name} className="h-6 w-6 rounded-full object-cover" />;
	}
	const ch = name?.[0] ?? "?";
	return (
		<div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">
			{ch}
		</div>
	);
}
