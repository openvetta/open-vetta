import { cn } from "@vetta/ui";
import type { JSX } from "react";
import { SessionStatusIcon } from "../sidebar/SessionStatusIcon";
import { SessionRenameInputView } from "./SessionRenameInputView";

export interface SessionRowViewProps {
	active: boolean;
	label: string;
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
	onOpenContextMenu,
	onRename,
	onRenameDone,
	onSelect,
	renaming,
	running,
	scheduled,
	timeLabel,
}: SessionRowViewProps): JSX.Element {
	return (
		<button
			type="button"
			onClick={() => {
				if (!renaming) onSelect();
			}}
			onContextMenu={onOpenContextMenu}
			className={cn(
				"relative flex w-full items-center gap-2 rounded-lg px-2.5 py-[6px] text-left transition-colors duration-100",
				active ? "bg-primary/15 text-foreground" : "hover:bg-accent/50",
			)}
			title={renaming ? undefined : label}
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
					<SessionStatusIcon active={active} running={running} scheduled={scheduled} />
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
