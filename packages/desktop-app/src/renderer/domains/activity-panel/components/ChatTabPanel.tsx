import { useProjectProfile } from "@shared/lib/project-profile";
import { ChatPanel } from "../../flowing-chat/components/ChatPanel";

interface ChatTabPanelProps {
	cwd: string;
}

export function ChatTabPanel({ cwd }: ChatTabPanelProps): JSX.Element {
	const { profile, loading } = useProjectProfile(cwd);

	if (loading) {
		return (
			<div className="flex h-full items-center justify-center text-[12px] text-muted-foreground/50">
				加载中…
			</div>
		);
	}

	if (!profile?.flowingId) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground/50">
				<span className="icon-[mdi--message-text-outline] text-[28px]" />
				<span className="text-[12px]">该项目不是流转项目，没有聊天室</span>
			</div>
		);
	}

	return <ChatPanel flowingId={profile.flowingId} />;
}
