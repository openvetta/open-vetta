import { ChatMessageListView as ThemeChatMessageListView } from "@vetta/theme-ui/sidebar";
import type { ChatMessageListModel } from "./useChatMessageListModel";

export function ChatMessageListView(model: ChatMessageListModel): JSX.Element {
	return (
		<ThemeChatMessageListView
			emptyText={model.emptyText}
			emptyIcon={model.emptyIcon}
			items={model.items}
			onSelect={model.onSelect}
		/>
	);
}
