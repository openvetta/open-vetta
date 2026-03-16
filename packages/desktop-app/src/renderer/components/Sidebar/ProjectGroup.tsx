import { useAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import type { Project, SessionInfo } from "../../store/atoms";
import { renamingSessionPathAtom, sessionContextMenuAtom } from "../../store/atoms";

interface ProjectGroupProps {
	project: Project;
	sessions: SessionInfo[];
	isExpanded: boolean;
	activeSessionPath: string;
	onToggle: (cwd: string) => void;
	onNewSession: (cwd: string) => void;
	onSelectSession: (cwd: string, sessionPath: string) => void;
	onRenameSession: (cwd: string, sessionPath: string, name: string) => void;
}

function projectName(cwd: string): string {
	return cwd.split("/").filter(Boolean).pop() ?? cwd;
}

function relativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return "刚刚";
	if (minutes < 60) return `${minutes} 分钟`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} 小时`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days} 天`;
	const weeks = Math.floor(days / 7);
	if (weeks < 5) return `${weeks} 周`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months} 个月`;
	return `${Math.floor(months / 12)} 年`;
}

function InlineRenameInput({
	session,
	cwd,
	onRename,
	onDone,
}: {
	session: SessionInfo;
	cwd: string;
	onRename: (cwd: string, sessionPath: string, name: string) => void;
	onDone: () => void;
}): JSX.Element {
	const [value, setValue] = useState(session.name || session.firstMessage || session.id);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);

	function commit() {
		const trimmed = value.trim();
		if (trimmed && trimmed !== (session.name || session.firstMessage || session.id)) {
			onRename(cwd, session.path, trimmed);
		}
		onDone();
	}

	return (
		<input
			ref={inputRef}
			value={value}
			onChange={(e) => setValue(e.target.value)}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === "Enter") commit();
				if (e.key === "Escape") onDone();
			}}
			className="min-w-0 flex-1 truncate rounded-[3px] border border-[var(--border-strong)] bg-[var(--bg-input,var(--hover))] pl-[20px] text-[13px] text-[var(--text-1)] outline-none"
		/>
	);
}

export function ProjectGroup({
	project,
	sessions,
	isExpanded,
	activeSessionPath,
	onToggle,
	onNewSession,
	onSelectSession,
	onRenameSession,
}: ProjectGroupProps): JSX.Element {
	const sortedSessions = [...sessions].sort((a, b) => b.modifiedAt - a.modifiedAt);
	const [, setContextMenu] = useAtom(sessionContextMenuAtom);
	const [renamingSessionPath, setRenamingSessionPath] = useAtom(renamingSessionPathAtom);

	return (
		<div className="mb-1">
			{/* Project row */}
			<button
				type="button"
				onClick={() => onToggle(project.cwd)}
				className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-[6px] text-left hover:bg-[var(--hover)]"
				title={project.cwd}
			>
				<span className="icon-[mdi--folder-outline] h-4 w-4 shrink-0 text-[var(--text-1)]" />
				<span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-1)]">
					{projectName(project.cwd)}
				</span>
				<button
					type="button"
					title="New session"
					onClick={(e) => {
						e.stopPropagation();
						onNewSession(project.cwd);
					}}
					className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] text-[var(--text-1)] opacity-0 hover:bg-[var(--hover-strong)] group-hover:opacity-100"
				>
					<span className="icon-[mdi--plus] h-3 w-3" />
				</button>
			</button>

			{/* Sessions */}
			{isExpanded && (
				<div className="mt-px space-y-px">
					{sortedSessions.length === 0 ? (
						<p className="px-2.5 py-1.5 pl-[36px] text-[12px] text-[var(--text-2)]">
							No sessions yet
						</p>
					) : (
						sortedSessions.map((session) => {
							const isActive = activeSessionPath === session.path;
							const isRenaming = renamingSessionPath === session.path;
							const label = session.name || session.firstMessage || session.id;
							return (
								<button
									key={session.path}
									type="button"
									onClick={() => {
										if (!isRenaming) onSelectSession(project.cwd, session.path);
									}}
									onContextMenu={(e) => {
										e.preventDefault();
										setContextMenu({ x: e.clientX, y: e.clientY, session });
									}}
									className={cn(
										"flex w-full items-center gap-2 rounded-lg px-2.5 py-[6px] text-left transition-colors duration-100",
										isActive
											? "bg-[var(--hover-strong)]"
											: "hover:bg-[var(--hover)]",
									)}
									title={isRenaming ? undefined : label}
								>
									{isRenaming ? (
										<InlineRenameInput
											session={session}
											cwd={project.cwd}
											onRename={onRenameSession}
											onDone={() => setRenamingSessionPath(null)}
										/>
									) : (
										<span
											className={cn(
												"min-w-0 flex-1 truncate pl-[20px] text-[13px]",
												isActive
													? "font-medium text-[var(--text-1)]"
													: "text-[var(--text-1)]",
											)}
										>
											{label}
										</span>
									)}
									<span className="shrink-0 text-[11px] text-[var(--text-2)]">
										{relativeTime(session.modifiedAt)}
									</span>
								</button>
							);
						})
					)}
				</div>
			)}
		</div>
	);
}
