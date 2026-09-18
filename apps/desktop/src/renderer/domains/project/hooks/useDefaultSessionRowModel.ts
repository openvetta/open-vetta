import type { DefaultConversationFilter, SessionInfo } from "@shared/store/atoms";
import { sessionDisplayLabel } from "@shared/store/atoms";
import type { DefaultSessionRowViewProps } from "@vetta-org/theme-ui/project";
import { useTranslation } from "react-i18next";
import { externalSessionCaption } from "./external-session-caption";

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
	const { t } = useTranslation("project");
	const forked = Boolean(session.parentSessionPath);
	return {
		active,
		contextMenuEnabled: filter !== "claw" && filter !== "external",
		label: sessionDisplayLabel(session),
		sessionPath: session.path,
		forked,
		titleExtra: forked ? t("sidebar.session.forkedTooltip") : undefined,
		caption: filter === "external" ? externalSessionCaption(session, t) : undefined,
		renaming,
		running,
		scheduled,
		onOpenContextMenu: (event) => onOpenContextMenu(event, session),
		onRename,
		onRenameDone,
		onSelect,
	};
}
