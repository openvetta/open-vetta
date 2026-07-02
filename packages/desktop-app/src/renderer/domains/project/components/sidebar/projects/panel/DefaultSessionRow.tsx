import type { DefaultConversationFilter, SessionInfo } from "@shared/store/atoms";
import { sessionDisplayLabel } from "@shared/store/atoms";
import { cn } from "@shared/lib/utils";
import { relativeTime } from "../relativeTime";
import { DefaultSessionRenameInput } from "./DefaultSessionRenameInput";

interface DefaultSessionRowProps {
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

export function DefaultSessionRow({
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
}: DefaultSessionRowProps): JSX.Element {
	const label = sessionDisplayLabel(session);

	return (
		<button
			key={session.path}
			type="button"
			onClick={() => {
				if (!renaming) onSelect();
			}}
			onContextMenu={(event) => {
				event.preventDefault();
				if (filter === "claw") return;
				onOpenContextMenu(event, session);
			}}
			className={cn(
				"flex w-full items-center gap-2 rounded-md px-2.5 py-[6px] text-left transition-colors duration-100",
				active ? "bg-primary/15 text-foreground" : "hover:bg-accent/50",
			)}
			title={renaming ? undefined : label}
		>
			{renaming ? (
				<DefaultSessionRenameInput
					onDone={onRenameDone}
					onRename={onRename}
					session={session}
				/>
			) : (
				<>
					{running ? (
						<span
							className={cn(
								"project-running-icon icon-[solar--refresh-linear] h-3.5 w-3.5 shrink-0 animate-spin",
								active ? "text-primary" : "text-muted-foreground",
							)}
						/>
					) : scheduled ? (
						<span className="icon-[solar--clock-circle-linear] h-3.5 w-3.5 shrink-0 text-primary/80" />
					) : (
						<span
							className={cn(
								"icon-[solar--chat-round-line-linear] h-3.5 w-3.5 shrink-0",
								active ? "text-foreground/70" : "text-muted-foreground/50",
							)}
						/>
					)}
					<span
						className={cn(
							"min-w-0 flex-1 truncate text-[13px]",
							active ? "font-semibold text-foreground" : "text-foreground",
						)}
					>
						{label}
					</span>
					<span className="shrink-0 text-[11px] text-muted-foreground">
						{relativeTime(session.modifiedAt)}
					</span>
				</>
			)}
		</button>
	);
}
