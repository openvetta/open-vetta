import type { SessionInfo } from "@shared/store/atoms";
import { sessionDisplayLabel } from "@shared/store/atoms";
import type { SessionRowViewProps } from "@vetta/theme-ui/project";
import { relativeTime } from "../components/sidebar/projects/relativeTime";

interface Args {
	active: boolean;
	cwd: string;
	renaming: boolean;
	running: boolean;
	scheduled: boolean;
	session: SessionInfo;
	onOpenContextMenu: (event: React.MouseEvent, session: SessionInfo) => void;
	onRename: (cwd: string, sessionPath: string, name: string) => void;
	onRenameDone: () => void;
	onSelect: (cwd: string, sessionPath: string) => void;
}

export function useSessionRowModel({
	active,
	cwd,
	renaming,
	running,
	scheduled,
	session,
	onOpenContextMenu,
	onRename,
	onRenameDone,
	onSelect,
}: Args): SessionRowViewProps {
	return {
		active,
		label: sessionDisplayLabel(session),
		renaming,
		running,
		scheduled,
		timeLabel: relativeTime(session.modifiedAt),
		onOpenContextMenu: (event) => onOpenContextMenu(event, session),
		onRename: (name) => onRename(cwd, session.path, name),
		onRenameDone,
		onSelect: () => onSelect(cwd, session.path),
	};
}
