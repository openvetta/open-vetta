import type { SessionInfo } from "@shared/store/atoms";
import { sessionDisplayLabel } from "@shared/store/atoms";
import { cn } from "@shared/lib/utils";
import { InlineSessionRenameInput } from "./InlineSessionRenameInput";
import { relativeTime } from "./relativeTime";
import { SessionStatusIcon } from "./SessionStatusIcon";

interface SessionRowProps {
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

export function SessionRow({
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
}: SessionRowProps): JSX.Element {
	const label = sessionDisplayLabel(session);

	return (
		<button
			key={session.path}
			type="button"
			onClick={() => {
				if (!renaming) onSelect(cwd, session.path);
			}}
			onContextMenu={(event) => onOpenContextMenu(event, session)}
			className={cn(
				"relative flex w-full items-center gap-2 rounded-lg px-2.5 py-[6px] text-left transition-colors duration-100",
				active ? "bg-primary/15 text-foreground" : "hover:bg-accent/50",
			)}
			title={renaming ? undefined : label}
		>
			{renaming ? (
				<InlineSessionRenameInput
					cwd={cwd}
					onDone={onRenameDone}
					onRename={onRename}
					session={session}
				/>
			) : (
				<>
					<SessionStatusIcon
						active={active}
						running={running}
						scheduled={scheduled}
					/>
					<span
						className={cn(
							"min-w-0 flex-1 truncate text-[13px]",
							running && "pl-1",
							active ? "font-semibold text-foreground" : "text-foreground",
						)}
					>
						{label}
					</span>
				</>
			)}
			<span className="shrink-0 text-[11px] text-muted-foreground">
				{relativeTime(session.modifiedAt)}
			</span>
		</button>
	);
}
