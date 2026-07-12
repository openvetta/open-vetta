import { useTranslation } from "react-i18next";
import { useProjectProfile } from "@shared/lib/project-profile";
import { ChatTabPanelView } from "@vetta/theme-ui/activity";
import { ChatPanel } from "../../flowing-chat/components/ChatPanel";

interface ChatTabPanelProps {
	cwd: string;
}

export function ChatTabPanel({ cwd }: ChatTabPanelProps): JSX.Element {
	const { t } = useTranslation("chat");
	const { profile, loading } = useProjectProfile(cwd);

	return (
		<ChatTabPanelView
			loading={loading}
			loadingLabel={t("activityPanel.chatTab.loading")}
			notFlowing={!profile?.flowingId}
			notFlowingLabel={t("activityPanel.chatTab.notFlowing")}
			panel={profile?.flowingId ? <ChatPanel flowingId={profile.flowingId} /> : null}
		/>
	);
}
