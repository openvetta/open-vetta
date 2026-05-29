import { useAtom, useAtomValue } from "jotai";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { cn, pathBasename } from "@shared/lib/utils";
import type { Project, ProjectType, SessionInfo } from "@shared/store/atoms";
import { projectContextMenuAtom, renamingSessionPathAtom, runningSessionPathsAtom, sessionContextMenuAtom } from "@shared/store/atoms";

interface ProjectGroupProps {
	project: Project;
	sessions: SessionInfo[];
	isExpanded: boolean;
	isActive?: boolean;
	activeSessionPath: string;
	onExpand: (cwd: string) => void;
	onCollapse: (cwd: string) => void;
	onNavigateProject: (cwd: string) => void;
	onNewSession: (cwd: string) => void;
	onSelectSession: (cwd: string, sessionPath: string) => void;
	onRenameSession: (cwd: string, sessionPath: string, name: string) => void;
}

const DEFAULT_VISIBLE_SESSIONS = 5;

const PROJECT_TYPE_ICONS: Record<ProjectType, string> = {
	normal: "icon-[mdi--folder-outline]",
	schedule: "icon-[mdi--robot-outline]",
	flowing: "icon-[mdi--swap-horizontal]",
	batch: "icon-[mdi--layers-outline]",
};

const PROJECT_TYPE_BADGES: Record<Exclude<ProjectType, "normal">, string> = {
	schedule: "自动化",
	flowing: "流转",
	batch: "批量",
};

function getProjectBadge(project: Project): string {
	if (project.type === "flowing" && typeof project.workflowInstanceId === "number") {
		return "工作流";
	}
	return PROJECT_TYPE_BADGES[project.type as Exclude<ProjectType, "normal">];
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

function RunningPulseDot(): JSX.Element {
	return (
		<span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-2 w-2 items-center justify-center">
			<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
			<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
		</span>
	);
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
			className="min-w-0 flex-1 truncate rounded-[3px] border border-input bg-accent/50 pl-[20px] text-[13px] text-foreground outline-none"
		/>
	);
}

export const ProjectGroup = memo(function ProjectGroup({
	project,
	sessions,
	isExpanded,
	isActive = false,
	activeSessionPath,
	onExpand,
	onCollapse,
	onNavigateProject,
	onNewSession,
	onSelectSession,
	onRenameSession,
}: ProjectGroupProps): JSX.Element {
	const sortedSessions = useMemo(
		() => [...sessions].sort((a, b) => b.modifiedAt - a.modifiedAt),
		[sessions],
	);
	const [, setContextMenu] = useAtom(sessionContextMenuAtom);
	const [, setProjectContextMenu] = useAtom(projectContextMenuAtom);
	const [renamingSessionPath, setRenamingSessionPath] = useAtom(renamingSessionPathAtom);
	const [showAllSessions, setShowAllSessions] = useState(false);
	const runningSessionPaths = useAtomValue(runningSessionPathsAtom);
	const projectHasRunning = useMemo(
		() => sessions.some((s) => runningSessionPaths.has(s.path)),
		[sessions, runningSessionPaths],
	);

	useEffect(() => {
		if (!isExpanded) setShowAllSessions(false);
	}, [isExpanded]);

	const hasMoreSessions = sortedSessions.length > DEFAULT_VISIBLE_SESSIONS;
	const visibleSessions = showAllSessions
		? sortedSessions
		: sortedSessions.slice(0, DEFAULT_VISIBLE_SESSIONS);
	const hiddenCount = sortedSessions.length - DEFAULT_VISIBLE_SESSIONS;

	const displayName = project.name ?? pathBasename(project.cwd);
	const projectType = project.type;
	const hasBadge = projectType !== "normal";

	return (
		<div className="mb-1">
			{/* Project row */}
			<div
				className={cn(
					"group flex w-full items-center gap-2 rounded-lg px-2.5 py-[6px] text-left transition-colors duration-100",
					isActive ? "bg-primary/15 text-foreground" : "hover:bg-accent/50",
				)}
				title={project.cwd}
				onContextMenu={(e) => {
					e.preventDefault();
					setProjectContextMenu({ x: e.clientX, y: e.clientY, project });
				}}
			>
				{/* Icon: collapsed = type icon (clickable to expand), expanded = chevron (clickable to collapse) */}
				{isExpanded ? (
					<button
						type="button"
						onClick={() => onCollapse(project.cwd)}
						className="relative flex shrink-0 items-center justify-center"
					>
						<span
							className={cn(
								"icon-[mdi--chevron-down] h-4 w-4",
								"text-foreground",
							)}
						/>
						{projectHasRunning && <RunningPulseDot />}
					</button>
				) : (
					<button
						type="button"
						onClick={() => {
							onExpand(project.cwd);
							onNavigateProject(project.cwd);
						}}
						className="relative flex shrink-0 items-center justify-center"
					>
						<span
							className={cn(
								PROJECT_TYPE_ICONS[projectType],
								"h-4 w-4",
								"text-foreground",
							)}
						/>
						{projectHasRunning && <RunningPulseDot />}
					</button>
				)}

				{/* Project name: click navigates to detail */}
				<button
					type="button"
					onClick={() => {
						if (!isExpanded) {
							onExpand(project.cwd);
						}
						onNavigateProject(project.cwd);
					}}
					className={cn(
						"min-w-0 flex-1 truncate text-left text-[13px] font-medium",
						isActive ? "font-semibold text-foreground" : "text-foreground",
					)}
				>
					{displayName}
				</button>

				{/* Badge / + button area */}
				<div className="relative flex shrink-0 items-center">
					{/* Badge: visible by default, hidden on group hover */}
					{hasBadge && (
						<span className="rounded-sm bg-accent px-1 py-px text-[10px] text-muted-foreground group-hover:hidden">
							{getProjectBadge(project)}
						</span>
					)}
					{/* + button: hidden by default, visible on group hover */}
					<button
						type="button"
						title="New session"
						onClick={(e) => {
							e.stopPropagation();
							onNewSession(project.cwd);
						}}
						className={cn(
							"flex h-[18px] w-[18px] items-center justify-center rounded-[4px] text-foreground hover:bg-accent",
							hasBadge ? "hidden group-hover:flex" : "opacity-0 group-hover:opacity-100",
						)}
					>
						<span className="icon-[mdi--plus] h-3 w-3" />
					</button>
				</div>
			</div>

			{/* Sessions */}
			{isExpanded && (
				<div className="mt-px space-y-px">
					{sortedSessions.length === 0 ? (
						<p className="px-2.5 py-1.5 pl-[36px] text-[12px] text-muted-foreground">
							暂无会话
						</p>
					) : (
						visibleSessions.map((session) => {
							const isActive = activeSessionPath === session.path;
							const isRenaming = renamingSessionPath === session.path;
							const isRunning = runningSessionPaths.has(session.path);
							const label = session.name || session.firstMessage || session.id;
							const isSchedule = label.startsWith("[定时]");
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
										"relative flex w-full items-center gap-2 rounded-lg px-2.5 py-[6px] text-left transition-colors duration-100",
										isActive
											? "bg-primary/15 text-foreground"
											: "hover:bg-accent/50",
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
										<>
											{isRunning ? (
												<span
													className={cn(
														"icon-[mdi--loading] ml-[20px] h-3.5 w-3.5 shrink-0 animate-spin",
														isActive ? "text-foreground" : "text-muted-foreground",
													)}
												/>
											) : isSchedule ? (
												<span className="icon-[mdi--clock-outline] ml-[20px] shrink-0 text-[11px] text-muted-foreground" />
											) : null}
											<span
												className={cn(
													"min-w-0 flex-1 truncate text-[13px]",
													!isSchedule && !isRunning && "pl-[20px]",
													isRunning && "pl-1",
													isActive
														? "font-semibold text-foreground"
														: "text-foreground",
												)}
											>
												{isSchedule ? label.slice(5) : label}
											</span>
										</>
									)}
									<span className="shrink-0 text-[11px] text-muted-foreground">
										{relativeTime(session.modifiedAt)}
									</span>
								</button>
							);
						})
					)}
					{hasMoreSessions && (
						<button
							type="button"
							onClick={() => setShowAllSessions((v) => !v)}
							className="flex w-full items-center gap-1 rounded-lg px-2.5 py-[6px] pl-[36px] text-left text-[12px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
						>
							<span
								className={cn(
									showAllSessions ? "icon-[mdi--chevron-up]" : "icon-[mdi--chevron-down]",
									"h-3.5 w-3.5 shrink-0",
								)}
							/>
							{showAllSessions ? "折叠会话" : `展开更多（${hiddenCount}）`}
						</button>
					)}
				</div>
			)}
		</div>
	);
});
