import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { pathBasename } from "@shared/lib/utils";
import type { Project, SessionInfo, SidebarFilter } from "@shared/store/atoms";
import { activeSessionAtom, confirmDialogAtom, projectContextMenuAtom, sessionContextMenuAtom, batchProjectsAtom, expandedBatchProjectsAtom } from "@shared/store/atoms";
import { useProjects } from "../hooks/useProjects";
import { ProjectGroup } from "./ProjectGroup";
import { ProjectContextMenu } from "./ProjectContextMenu";
import { SessionContextMenu } from "./SessionContextMenu";
import { useBatchTasks } from "../../batch-tasks/hooks/useBatchTasks";

interface ProjectsPanelProps {
	filter: SidebarFilter;
	onOpenSession: (cwd: string, sessionPath?: string) => Promise<void>;
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
	} = useProjects();
	const activeSession = useAtomValue(activeSessionAtom);
	const [contextMenu, setContextMenu] = useAtom(sessionContextMenuAtom);
	const [projectMenu, setProjectMenu] = useAtom(projectContextMenuAtom);
	const setConfirm = useSetAtom(confirmDialogAtom);
	const navigate = useNavigate();

	const batchProjects = useAtomValue(batchProjectsAtom);
	const [expandedBatchProjects, setExpandedBatchProjects] = useAtom(expandedBatchProjectsAtom);
	const { toggleProject: toggleBatchProject, deleteTask: deleteBatchTask, deleteProject: deleteBatchProject } = useBatchTasks();

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

	const filteredProjects = useMemo(() => {
		if (filter === "all") return projects;
		return projects.filter((p) => p.type === filter);
	}, [projects, filter]);

	const handleNavigateProject = useCallback(
		(cwd: string) => {
			void navigate({ to: "/project/$cwd", params: { cwd: encodeURIComponent(cwd) } });
		},
		[navigate],
	);

	const handleDeleteSession = useCallback(
		(session: { cwd: string; path: string }) => {
			// Batch-task session: route to batch deleteTask so batchProjectsAtom updates.
			const batchMatch = batchProjects.find((bp) =>
				bp.tasks.some((t) => t.sessionPath === session.path),
			);
			if (batchMatch) {
				const task = batchMatch.tasks.find((t) => t.sessionPath === session.path);
				if (task) {
					void deleteBatchTask(batchMatch.id, task.id);
					setContextMenu(null);
					return;
				}
			}
			void deleteSession(session.cwd, session.path);
			setContextMenu(null);
		},
		[batchProjects, deleteBatchTask, deleteSession, setContextMenu],
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

	const handleRemove = useCallback(
		(cwd: string) => {
			setProjectMenu(null);
			// Batch project: "移除" 等同于删除批量项目（无独立列表概念）
			const batch = batchProjects.find((bp) => bp.id === cwd);
			if (batch) {
				setConfirm({
					title: "删除批量项目",
					message: `确定要删除批量项目「${batch.name}」吗？此操作不可撤回。`,
					confirmLabel: "删除",
					variant: "danger",
					onConfirm: async () => {
						await deleteBatchProject(batch.id);
					},
				});
				return;
			}
			const project = projects.find((p) => p.cwd === cwd);
			const displayName = project?.name ?? pathBasename(cwd);
			setConfirm({
				title: "从列表中移除",
				message: `确定要将「${displayName}」从项目列表中移除吗？此操作不会删除磁盘上的文件。`,
				confirmLabel: "移除",
				variant: "default",
				onConfirm: () => {
					void removeProject(cwd);
				},
			});
		},
		[removeProject, setProjectMenu, setConfirm, projects, batchProjects, deleteBatchProject],
	);

	const handleDelete = useCallback(
		(cwd: string) => {
			setProjectMenu(null);
			const batch = batchProjects.find((bp) => bp.id === cwd);
			if (batch) {
				setConfirm({
					title: "删除批量项目",
					message: `确定要删除批量项目「${batch.name}」吗？此操作不可撤回。`,
					confirmLabel: "删除",
					variant: "danger",
					onConfirm: async () => {
						await deleteBatchProject(batch.id);
					},
				});
				return;
			}
			const project = projects.find((p) => p.cwd === cwd);
			const displayName = project?.name ?? pathBasename(cwd);
			setConfirm({
				title: "删除项目",
				message: `确定要永久删除「${displayName}」吗？此操作将从磁盘上彻底删除该项目文件夹，不可恢复。`,
				confirmLabel: "删除",
				variant: "danger",
				onConfirm: () => {
					void deleteProjectFromDisk(cwd);
				},
			});
		},
		[deleteProjectFromDisk, setProjectMenu, setConfirm, projects, batchProjects, deleteBatchProject],
	);

	const expandBatchProject = useCallback(
		(key: string) => {
			setExpandedBatchProjects((prev) => {
				if (prev.has(key)) return prev;
				const next = new Set(prev);
				next.add(key);
				return next;
			});
		},
		[setExpandedBatchProjects],
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

	if (filteredProjects.length === 0 && (!showBatchGroup || batchAsProjects.length === 0)) {
		return (
			<div className="flex flex-col items-center gap-2.5 px-4 py-10 text-center">
				<span className="icon-[mdi--folder-open-outline] h-7 w-7 text-muted-foreground" />
				<p className="text-[11px] text-foreground">还没有项目</p>
				<p className="text-[11px] text-muted-foreground">点击上方 + 新建项目</p>
			</div>
		);
	}

	return (
		<>
			{filteredProjects.map((project) => (
				<ProjectGroup
					key={project.cwd}
					project={project}
					sessions={sessionsMap.get(project.cwd) ?? []}
					isExpanded={expandedProjects.has(project.cwd)}
					activeSessionPath={activeSession?.sessionPath ?? ""}
					onExpand={expandProject}
					onCollapse={collapseProject}
					onNavigateProject={handleNavigateProject}
					onNewSession={(cwd) => void onOpenSession(cwd)}
					onSelectSession={(cwd, path) => void onOpenSession(cwd, path)}
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
						activeSessionPath={activeSession?.sessionPath ?? ""}
						onExpand={expandBatchProject}
						onCollapse={collapseBatchProject}
						onNavigateProject={handleNavigateProject}
						onNewSession={(cwd) => void onOpenSession(cwd)}
						onSelectSession={(_, path) => {
							const task = visibleBatchProjects
								.flatMap((bp) => bp.tasks)
								.find((t) => t.sessionPath === path);
							if (task) void onOpenSession(task.cwd, path);
						}}
						onRenameSession={handleRenameSession}
					/>
				))}
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
				/>
			)}
		</>
	);
}
