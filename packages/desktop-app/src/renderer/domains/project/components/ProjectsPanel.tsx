import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useMatches } from "@tanstack/react-router";
import { cn, pathBasename } from "@shared/lib/utils";
import type { Project, SessionInfo, SessionExecutionMode, SidebarFilter } from "@shared/store/atoms";
import { activeSessionAtom, activityPanelOpenAtom, confirmDialogAtom, inlineFilePreviewAtom, projectContextMenuAtom, renamingSessionPathAtom, runningSessionPathsAtom, sessionContextMenuAtom, batchProjectsAtom, expandedBatchProjectsAtom } from "@shared/store/atoms";
import { useProjects } from "../hooks/useProjects";
import { ProjectGroup } from "./ProjectGroup";
import { ProjectContextMenu } from "./ProjectContextMenu";
import { SessionContextMenu } from "./SessionContextMenu";
import { useBatchTasks } from "../../batch-tasks/hooks/useBatchTasks";

interface ProjectsPanelProps {
	filter: SidebarFilter;
	onOpenSession: (cwd: string, sessionPath?: string, executionMode?: SessionExecutionMode) => Promise<void>;
}

export function ProjectsPanel({ filter, onOpenSession }: ProjectsPanelProps): JSX.Element {
	const {
		projects,
		sessionsMap,
		expandedProjects,
		expandProject,
		collapseProject,
		toggleProject,
		deleteSession,
		renameSession,
		archiveProject,
		removeProject,
		deleteProjectFromDisk,
		loadSessions,
	} = useProjects();
	const runningSessionPaths = useAtomValue(runningSessionPathsAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const setActiveSession = useSetAtom(activeSessionAtom);
	const setInlineFilePreview = useSetAtom(inlineFilePreviewAtom);
	const setActivityPanelOpen = useSetAtom(activityPanelOpenAtom);
	const activeSessionPath = activeSession?.sessionPath ?? "";
	const [contextMenu, setContextMenu] = useAtom(sessionContextMenuAtom);
	const [projectMenu, setProjectMenu] = useAtom(projectContextMenuAtom);
	const setConfirm = useSetAtom(confirmDialogAtom);
	const navigate = useNavigate();
	const matches = useMatches();
	const currentPath = matches[matches.length - 1]?.pathname ?? "/";

	const batchProjects = useAtomValue(batchProjectsAtom);
	const [expandedBatchProjects, setExpandedBatchProjects] = useAtom(expandedBatchProjectsAtom);
	const { toggleProject: toggleBatchProject, deleteTask: deleteBatchTask, deleteProject: deleteBatchProject } = useBatchTasks();

	// 手风琴：展开任一项目（普通 / 批量）时，关闭另一侧的所有展开项。
	const expandProjectAccordion = useCallback(
		(cwd: string) => {
			setExpandedBatchProjects(new Set());
			expandProject(cwd);
		},
		[expandProject, setExpandedBatchProjects],
	);
	const expandBatchProjectAccordion = useCallback(
		(cwd: string) => {
			for (const c of expandedProjects) collapseProject(c);
			setExpandedBatchProjects(new Set([cwd]));
		},
		[collapseProject, expandedProjects, setExpandedBatchProjects],
	);

	// Convert visible batch projects to Project + SessionInfo format
	const visibleBatchProjects = useMemo(() => batchProjects.filter((bp) =>
		bp.tasks.some((t) => t.sessionPath),
	), [batchProjects]);

	const batchAsProjects = useMemo(() => visibleBatchProjects.map((bp): { project: Project; sessions: SessionInfo[] } => {
		const tasksWithSession = bp.tasks.filter((t) => t.sessionPath);
		return {
			project: {
				cwd: bp.id,
				name: bp.name,
				sessionCount: tasksWithSession.length,
				type: "batch",
			},
			sessions: tasksWithSession.map((t) => ({
				id: t.id,
				path: t.sessionPath!,
				cwd: t.cwd,
				name: t.name || undefined,
				firstMessage: t.name || t.id,
				modifiedAt: t.updatedAt,
			})),
		};
	}), [visibleBatchProjects]);

	const showBatchGroup = filter === "all" || filter === "batch";

	// 默认「对话」项目独立渲染在最上方，不参与过滤、不和其他项目混排。
	const defaultProject = useMemo(() => projects.find((p) => p.isDefault), [projects]);

	const filteredProjects = useMemo(() => {
		// 排除：批量项目（下方专用 group 渲染）和默认对话项目（顶部独立块渲染）。
		const visible = projects.filter((p) => p.type !== "batch" && !p.isDefault);
		if (filter === "all") return visible;
		return visible.filter((p) => p.type === filter);
	}, [projects, filter]);

	const handleNavigateProject = useCallback(
		(cwd: string) => {
			// 必须先 navigate 再清 activeSession：否则在 `/` 路径下，setActiveSession(null) 会触发
			// RootLayout 的根路径守卫（currentPath==="/" && !activeSession）抢跑到 /new-session。
			void (async () => {
				// 跳转前先收起活动面板与内嵌文件预览，与切换 session 的行为一致
				// （见 useSessionManager.openSession）。否则项目详情页的 ActivityPanel
				// 会继续渲染上一个 session 的全局文件预览状态。
				setInlineFilePreview(null);
				setActivityPanelOpen(false);
				await navigate({ to: "/project/$cwd", params: { cwd: encodeURIComponent(cwd) } });
				// 切到项目详情后清除 session 激活，避免侧边栏「项目 + session」同时高亮
				setActiveSession(null);
			})();
		},
		[navigate, setActiveSession, setInlineFilePreview, setActivityPanelOpen],
	);

	const handleSelectSession = useCallback(
		(cwd: string, path: string) => {
			// IM-origin sessions are owned by the im-gateway sidecar. Opening
			// them via the normal write path would race the sidecar for the
			// session-file lock; route to the read-only viewer instead.
			const session = sessionsMap.get(cwd)?.find((s) => s.path === path);
			if (session?.origin === "im") {
				void navigate({ to: "/viewer/$path", params: { path: encodeURIComponent(path) } });
				return;
			}
			void onOpenSession(cwd, path);
		},
		[onOpenSession, sessionsMap, navigate],
	);

	const handleNewSession = useCallback(
		(cwd: string) => {
			void navigate({ to: "/new-session/$cwd", params: { cwd: encodeURIComponent(cwd) } });
		},
		[navigate],
	);

	const handleSelectBatchSession = useCallback(
		(_cwd: string, path: string) => {
			const task = visibleBatchProjects
				.flatMap((bp) => bp.tasks)
				.find((t) => t.sessionPath === path);
			if (task) void onOpenSession(task.cwd, path, task.executionMode);
		},
		[visibleBatchProjects, onOpenSession],
	);

	const handleBatchNewSession = useCallback(
		(cwd: string) => {
			void onOpenSession(cwd);
		},
		[onOpenSession],
	);

	const handleDefaultSelectSession = useCallback(
		(cwd: string, path: string) => {
			const session = sessionsMap.get(cwd)?.find((s) => s.path === path);
			if (session?.origin === "im") {
				void navigate({ to: "/viewer/$path", params: { path: encodeURIComponent(path) } });
				return;
			}
			void onOpenSession(cwd, path);
		},
		[onOpenSession, sessionsMap, navigate],
	);

	const handleDeleteSession = useCallback(
		(session: { cwd: string; path: string }) => {
			const wasActive = activeSession?.sessionPath === session.path;
			const goToProjectDetail = (projectCwd: string) => {
				if (!wasActive) return;
				setActiveSession(null);
				if (currentPath === "/") {
					// 删除当前 active session 后，回到该项目的 NewSession 页，方便立即开始下一段对话。
					void navigate({ to: "/new-session/$cwd", params: { cwd: encodeURIComponent(projectCwd) } });
				}
			};
			// Batch-task session: route to batch deleteTask so batchProjectsAtom updates.
			const batchMatch = batchProjects.find((bp) =>
				bp.tasks.some((t) => t.sessionPath === session.path),
			);
			if (batchMatch) {
				const task = batchMatch.tasks.find((t) => t.sessionPath === session.path);
				if (task) {
					void deleteBatchTask(batchMatch.id, task.id);
					setContextMenu(null);
					goToProjectDetail(batchMatch.id);
					return;
				}
			}
			void deleteSession(session.cwd, session.path);
			setContextMenu(null);
			goToProjectDetail(session.cwd);
		},
		[activeSession, batchProjects, deleteBatchTask, deleteSession, setContextMenu, setActiveSession, currentPath, navigate],
	);

	const handleRenameSession = useCallback(
		(cwd: string, sessionPath: string, name: string) => {
			void renameSession(cwd, sessionPath, name);
		},
		[renameSession],
	);

	const handleArchive = useCallback(
		(cwd: string) => {
			void archiveProject(cwd);
			setProjectMenu(null);
		},
		[archiveProject, setProjectMenu],
	);

	const cleanupAfterProjectGone = useCallback(
		(projectCwd: string, sessionPathsInProject: string[]) => {
			const activeBelongsToProject = activeSession
				? activeSession.cwd === projectCwd || sessionPathsInProject.includes(activeSession.sessionPath)
				: false;
			if (activeBelongsToProject) setActiveSession(null);
			const onDeletedProjectPage = currentPath === `/project/${encodeURIComponent(projectCwd)}`;
			if (onDeletedProjectPage) {
				void navigate({ to: "/" });
			}
		},
		[activeSession, setActiveSession, currentPath, navigate],
	);

	const handleRemove = useCallback(
		(cwd: string) => {
			setProjectMenu(null);
			// Batch project: "移除" 等同于删除批量项目（无独立列表概念）
			const batch = batchProjects.find((bp) => bp.id === cwd);
			if (batch) {
				const taskPaths = batch.tasks.map((t) => t.sessionPath).filter((p): p is string => !!p);
				setConfirm({
					title: "删除批量项目",
					message: `确定要删除批量项目「${batch.name}」吗？此操作不可撤回。`,
					confirmLabel: "删除",
					variant: "danger",
					onConfirm: async () => {
						await deleteBatchProject(batch.id);
						cleanupAfterProjectGone(batch.id, taskPaths);
					},
				});
				return;
			}
			const project = projects.find((p) => p.cwd === cwd);
			const displayName = project?.name ?? pathBasename(cwd);
			const sessionPaths = (sessionsMap.get(cwd) ?? []).map((s) => s.path);
			setConfirm({
				title: "从列表中移除",
				message: `确定要将「${displayName}」从项目列表中移除吗？此操作不会删除磁盘上的文件。`,
				confirmLabel: "移除",
				variant: "default",
				onConfirm: async () => {
					await removeProject(cwd);
					cleanupAfterProjectGone(cwd, sessionPaths);
				},
			});
		},
		[removeProject, setProjectMenu, setConfirm, projects, batchProjects, deleteBatchProject, sessionsMap, cleanupAfterProjectGone],
	);

	const handleDelete = useCallback(
		(cwd: string) => {
			setProjectMenu(null);
			const batch = batchProjects.find((bp) => bp.id === cwd);
			if (batch) {
				const taskPaths = batch.tasks.map((t) => t.sessionPath).filter((p): p is string => !!p);
				setConfirm({
					title: "删除批量项目",
					message: `确定要删除批量项目「${batch.name}」吗？此操作不可撤回。`,
					confirmLabel: "删除",
					variant: "danger",
					onConfirm: async () => {
						await deleteBatchProject(batch.id);
						cleanupAfterProjectGone(batch.id, taskPaths);
					},
				});
				return;
			}
			const project = projects.find((p) => p.cwd === cwd);
			const displayName = project?.name ?? pathBasename(cwd);
			const sessionPaths = (sessionsMap.get(cwd) ?? []).map((s) => s.path);
			setConfirm({
				title: "删除项目",
				message: `确定要永久删除「${displayName}」吗？此操作将从磁盘上彻底删除该项目文件夹，不可恢复。`,
				confirmLabel: "删除",
				variant: "danger",
				onConfirm: async () => {
					await deleteProjectFromDisk(cwd);
					cleanupAfterProjectGone(cwd, sessionPaths);
				},
			});
		},
		[deleteProjectFromDisk, setProjectMenu, setConfirm, projects, batchProjects, deleteBatchProject, sessionsMap, cleanupAfterProjectGone],
	);

	const handleClearDefault = useCallback(
		(cwd: string) => {
			setProjectMenu(null);
			const sessions = sessionsMap.get(cwd) ?? [];
			setConfirm({
				title: "清空会话",
				message: `将删除「对话」项目下 ${sessions.length} 个会话及其所有产物，此操作不可恢复。`,
				confirmLabel: "清空",
				variant: "danger",
				onConfirm: async () => {
					await window.vetta.session.clearDefaultConversation();
					// 当前 active session 若在被清空范围内，复位并跳回 NewSession 页。
					const sessionPaths = sessions.map((s) => s.path);
					if (activeSession && (activeSession.cwd === cwd || sessionPaths.includes(activeSession.sessionPath))) {
						setActiveSession(null);
						void navigate({
							to: "/new-session/$cwd",
							params: { cwd: encodeURIComponent(cwd) },
						});
					}
					await loadSessions(cwd);
				},
			});
		},
		[setProjectMenu, setConfirm, sessionsMap, activeSession, setActiveSession, navigate, loadSessions],
	);

	const collapseBatchProject = useCallback(
		(key: string) => {
			setExpandedBatchProjects((prev) => {
				if (!prev.has(key)) return prev;
				const next = new Set(prev);
				next.delete(key);
				return next;
			});
		},
		[setExpandedBatchProjects],
	);

	// 当前激活的项目 cwd：基于 `/project/<cwd>` 路径识别；兼容 tanstack-router 可能的多次编码。
	const activeProjectCandidates = useMemo(() => {
		if (!currentPath.startsWith("/project/")) return new Set<string>();
		const raw = currentPath.slice("/project/".length);
		if (!raw) return new Set<string>();
		const variants = new Set<string>([raw]);
		let v = raw;
		for (let i = 0; i < 3; i++) {
			try {
				const decoded = decodeURIComponent(v);
				if (decoded === v) break;
				variants.add(decoded);
				v = decoded;
			} catch {
				break;
			}
		}
		return variants;
	}, [currentPath]);
	const isProjectActive = useCallback(
		(cwd: string) => activeProjectCandidates.has(cwd),
		[activeProjectCandidates],
	);

	const noOtherProjects =
		filteredProjects.length === 0 && (!showBatchGroup || batchAsProjects.length === 0);

	const defaultExpanded = defaultProject ? expandedProjects.has(defaultProject.cwd) : false;
	const defaultSessions = defaultProject ? (sessionsMap.get(defaultProject.cwd) ?? []) : [];

	return (
		<>
			{noOtherProjects && !defaultProject && (
				<div className="flex flex-col items-center gap-2.5 px-4 py-10 text-center">
					<span className="icon-[mdi--folder-open-outline] h-7 w-7 text-muted-foreground" />
					<p className="text-[11px] text-foreground">还没有项目</p>
					<p className="text-[11px] text-muted-foreground">点击上方 + 新建项目</p>
				</div>
			)}
			{filteredProjects.map((project) => (
				<ProjectGroup
					key={project.cwd}
					project={project}
					sessions={sessionsMap.get(project.cwd) ?? []}
					isExpanded={expandedProjects.has(project.cwd)}
					isActive={isProjectActive(project.cwd)}
					activeSessionPath={activeSessionPath}
					onExpand={expandProjectAccordion}
					onCollapse={collapseProject}
					onNavigateProject={handleNavigateProject}
					onNewSession={handleNewSession}
					onSelectSession={handleSelectSession}
					onRenameSession={handleRenameSession}
				/>
			))}
			{showBatchGroup &&
				batchAsProjects.map(({ project, sessions }) => (
					<ProjectGroup
						key={project.cwd}
						project={project}
						sessions={sessions}
						isExpanded={expandedBatchProjects.has(project.cwd)}
						isActive={isProjectActive(project.cwd)}
						activeSessionPath={activeSessionPath}
						onExpand={expandBatchProjectAccordion}
						onCollapse={collapseBatchProject}
						onNavigateProject={handleNavigateProject}
						onNewSession={handleBatchNewSession}
						onSelectSession={handleSelectBatchSession}
						onRenameSession={handleRenameSession}
					/>
				))}
			{/* 默认「对话」：放在项目列表下方，flat 风格 session 列表（没有文件夹外壳）。 */}
			{defaultProject && (
				<div className="mt-2">
					<div
						className="group -mx-1.5 flex items-center justify-between px-2 pb-1 pt-1"
						onContextMenu={(e) => {
							e.preventDefault();
							setProjectMenu({ x: e.clientX, y: e.clientY, project: defaultProject });
						}}
					>
						<button
							type="button"
							onClick={() =>
								defaultExpanded
									? collapseProject(defaultProject.cwd)
									: expandProjectAccordion(defaultProject.cwd)
							}
							className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-muted-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
							title={defaultExpanded ? "折叠" : "展开"}
						>
							<span
								className={cn(
									"icon-[mdi--chevron-down] h-3 w-3 shrink-0 transition-transform",
									defaultExpanded ? "" : "-rotate-90",
								)}
							/>
							<span className="truncate">{defaultProject.name ?? "对话"}</span>
						</button>
						<div className="flex items-center">
							<button
								type="button"
								title="更多"
								onClick={(e) => {
									e.stopPropagation();
									const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
									setProjectMenu({ x: rect.left, y: rect.bottom + 4, project: defaultProject });
								}}
								className="flex items-center justify-center rounded-md p-1.5 text-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-60 group-hover:hover:opacity-100"
							>
								<span className="icon-[mdi--dots-horizontal] h-4 w-4" />
							</button>
							<button
								type="button"
								title="新会话"
								onClick={() =>
									void navigate({
										to: "/new-session/$cwd",
										params: { cwd: encodeURIComponent(defaultProject.cwd) },
									})
								}
								className="flex items-center justify-center rounded-md p-1.5 text-foreground opacity-60 transition-colors hover:bg-accent hover:opacity-100"
							>
								<span className="icon-[mdi--message-plus-outline] h-4 w-4" />
							</button>
						</div>
					</div>
					{defaultExpanded && (
						<DefaultSessionList
							cwd={defaultProject.cwd}
							sessions={defaultSessions}
							activeSessionPath={activeSessionPath}
							onSelectSession={handleDefaultSelectSession}
							onRenameSession={handleRenameSession}
						/>
					)}
				</div>
			)}
			{contextMenu && (
				<SessionContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					session={contextMenu.session}
					onClose={() => setContextMenu(null)}
					onDelete={handleDeleteSession}
				/>
			)}
			{projectMenu && (
				<ProjectContextMenu
					x={projectMenu.x}
					y={projectMenu.y}
					project={projectMenu.project}
					onClose={() => setProjectMenu(null)}
					onArchive={handleArchive}
					onRemove={handleRemove}
					onDelete={handleDelete}
					onClearDefault={handleClearDefault}
					clearDefaultDisabled={
						projectMenu.project.isDefault === true &&
						(sessionsMap.get(projectMenu.project.cwd) ?? []).some((s) => runningSessionPaths.has(s.path))
					}
				/>
			)}
		</>
	);
}

function relativeTime(timestamp: number): string {
	const diff = Date.now() - timestamp;
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

interface DefaultSessionListProps {
	cwd: string;
	sessions: SessionInfo[];
	activeSessionPath: string;
	onSelectSession: (cwd: string, sessionPath: string) => void;
	onRenameSession: (cwd: string, sessionPath: string, name: string) => void;
}

const DefaultSessionList = memo(function DefaultSessionList({
	cwd,
	sessions,
	activeSessionPath,
	onSelectSession,
	onRenameSession,
}: DefaultSessionListProps): JSX.Element {
	const sorted = useMemo(
		() => [...sessions].sort((a, b) => b.modifiedAt - a.modifiedAt),
		[sessions],
	);
	const [, setContextMenu] = useAtom(sessionContextMenuAtom);
	const [renamingSessionPath, setRenamingSessionPath] = useAtom(renamingSessionPathAtom);
	const runningSessionPaths = useAtomValue(runningSessionPathsAtom);

	if (sorted.length === 0) {
		return (
			<p className="px-2.5 py-1.5 text-[11px] text-muted-foreground/60">暂无对话</p>
		);
	}

	return (
		<div className="space-y-px">
			{sorted.map((session) => {
				const isActive = activeSessionPath === session.path;
				const isRenaming = renamingSessionPath === session.path;
				const isRunning = runningSessionPaths.has(session.path);
				const label = session.name || session.firstMessage || session.id;
				return (
					<button
						key={session.path}
						type="button"
						onClick={() => {
							if (!isRenaming) onSelectSession(cwd, session.path);
						}}
						onContextMenu={(e) => {
							e.preventDefault();
							setContextMenu({ x: e.clientX, y: e.clientY, session });
						}}
						className={cn(
							"flex w-full items-center gap-2 rounded-md px-2.5 py-[6px] text-left transition-colors duration-100",
							isActive ? "bg-primary/15 text-primary" : "hover:bg-accent/50",
						)}
						title={isRenaming ? undefined : label}
					>
						{isRenaming ? (
							<InlineDefaultRenameInput
								session={session}
								onRename={(name) => onRenameSession(cwd, session.path, name)}
								onDone={() => setRenamingSessionPath(null)}
							/>
						) : (
							<>
								{isRunning && (
									<span
										className={cn(
											"icon-[mdi--loading] h-3.5 w-3.5 shrink-0 animate-spin",
											isActive ? "text-primary" : "text-muted-foreground",
										)}
									/>
								)}
								<span
									className={cn(
										"min-w-0 flex-1 truncate text-[13px]",
										isActive ? "font-semibold text-primary" : "text-foreground",
									)}
								>
									{label}
								</span>
								{session.origin === "im" && (
									<span
										className="shrink-0 rounded bg-emerald-500/15 px-1 py-[1px] text-[9px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400"
										title="该会话来自 IM 网关"
									>
										IM
									</span>
								)}
								<span className="shrink-0 text-[11px] text-muted-foreground">
									{relativeTime(session.modifiedAt)}
								</span>
							</>
						)}
					</button>
				);
			})}
		</div>
	);
});

function InlineDefaultRenameInput({
	session,
	onRename,
	onDone,
}: {
	session: SessionInfo;
	onRename: (name: string) => void;
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
			onRename(trimmed);
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
			className="min-w-0 flex-1 truncate rounded-[3px] border border-input bg-accent/50 text-[13px] text-foreground outline-none"
		/>
	);
}
