import { memo } from "react";
import { useTranslation } from "react-i18next";
import { MessageListFooterView } from "@vetta/theme-ui/chat";
import { PluginTurnCardHost } from "../../../plugins/components/PluginTurnCardHost";
import { StreamingIndicator } from "./AssistantMessage";

export const MessageListFooter = memo(function MessageListFooter({
	isCompacting,
	showWaiting,
}: {
	isCompacting: boolean;
	showWaiting: boolean;
}) {
	const { t } = useTranslation("chat");
	return (
		<MessageListFooterView
			compactionLabel={t("messageList.compactionIndicator")}
			isCompacting={isCompacting}
			showWaiting={showWaiting}
			streamingIndicator={<StreamingIndicator />}
			pluginHost={<PluginTurnCardHost />}
		/>
	);
});
