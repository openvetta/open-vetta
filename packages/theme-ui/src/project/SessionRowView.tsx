import { cn } from "@vetta/ui";
import type { JSX } from "react";
import { SessionStatusIcon } from "../sidebar/SessionStatusIcon";
import { SessionRenameInputView } from "./SessionRenameInputView";
import {
	prepareSidebarSelection,
	runAfterSidebarSelection,
} from "./useActiveSessionAutoScroll";

export interface SessionRowViewProps {
	active: boolean;
	label: string;
	/** Tooltip / secondary label (e.g. forked-from preview). */
	titleExtra?: string;
	/** Session was forked from another session. */
	forked?: boolean;
	onOpenContextMenu: (event: React.MouseEvent) => void;
	onRename: (name: string) => void;
	onRenameDone: () => void;
	onSelect: () => void;
	renaming: boolean;
	running: boolean;
	scheduled: boolean;
	timeLabel: string;
}

export function SessionRowView({
	active,
	label,
	titleExtra,
	forked,
	onOpenContextMenu,
	onRename,
	onRenameDone,
	onSelect,
	renaming,
	running,
	scheduled,
	timeLabel,
}: SessionRowViewProps): JSX.Element {
	const title = renaming ? undefined : titleExtra ? `${label}\n${titleExtra}` : label;
	return (
		<button
			type="button"
			data-session-active={active ? "true" : undefined}
			onClick={(event) => {
				if (renaming) return;
				runAfterSidebarSelection(onSelect, prepareSidebarSelection(event.currentTarget));
			}}
			onContextMenu={onOpenContextMenu}
			className={cn(
				"relative flex w-full items-center gap-2 rounded-lg px-2.5 py-[6px] text-left transition-colors duration-100",
				active ? "bg-primary/15 text-foreground" : "hover:bg-accent/50",
			)}
			title={title}
		>
			{renaming ? (
				<SessionRenameInputView
					className="min-w-0 flex-1 truncate rounded-[3px] border border-input bg-accent/50 pl-[20px] text-[13px] text-foreground outline-none"
					initialValue={label}
					onCancel={onRenameDone}
					onCommit={onRename}
				/>
			) : (
				<>
					{forked && !running && !scheduled ? (
						<span
							className={cn(
								"icon-[mdi--source-fork] h-3.5 w-3.5 shrink-0",
								active ? "text-primary/80" : "text-muted-foreground/60",
							)}
						/>
					) : (
						<SessionStatusIcon active={active} running={running} scheduled={scheduled} />
					)}
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
			<span className="shrink-0 text-[11px] text-muted-foreground">{timeLabel}</span>
		</button>
	);
}
