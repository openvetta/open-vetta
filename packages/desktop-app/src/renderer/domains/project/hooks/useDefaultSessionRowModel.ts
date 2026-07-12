import type { DefaultConversationFilter, SessionInfo } from "@shared/store/atoms";
import { sessionDisplayLabel } from "@shared/store/atoms";
import type { DefaultSessionRowViewProps } from "@vetta/theme-ui/project";
import { relativeTime } from "../components/sidebar/projects/relativeTime";

interface Args {
	active: boolean;
	filter: DefaultConversationFilter;
	onOpenContextMenu: (event: React.MouseEvent, session: SessionInfo) => void;
	onRename: (name: string) => void;
	onRenameDone: () => void;
	onSelect: () => void;
	renaming: boolean;
	running: boolean;
	scheduled: boolean;
	session: SessionInfo;
}

export function useDefaultSessionRowModel({
	active,
	filter,
	onOpenContextMenu,
	onRename,
	onRenameDone,
	onSelect,
	renaming,
	running,
	scheduled,
	session,
}: Args): DefaultSessionRowViewProps {
	return {
		active,
		contextMenuEnabled: filter !== "claw",
		label: sessionDisplayLabel(session),
		renaming,
		running,
		scheduled,
		timeLabel: relativeTime(session.modifiedAt),
		onOpenContextMenu: (event) => onOpenContextMenu(event, session),
		onRename,
		onRenameDone,
		onSelect,
	};
}
