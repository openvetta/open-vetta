import { useParams } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	activityPanelOpenAtom,
	authTokenAtom,
	batchProjectsAtom,
	confirmDialogAtom,
	isPersonalModeAtom,
	openSessionFnRef,
	projectsAtom,
	sessionsMapAtom,
	workflowInstanceAtom,
} from "@shared/store/atoms";
import { useAtom } from "jotai";
import { ActivityPanel } from "@domains/activity-panel/components/ActivityPanel";
import { pathBasename } from "@shared/lib/utils";
import { fetchWorkflowInstanceByFlowing } from "@shared/lib/api";
import { Button } from "@shared/components/ui/button";
import { isMac } from "@shared/lib/platform";
import { BatchQueueStatus } from "./BatchQueueStatus";
import { ScheduleStatus } from "./ScheduleStatus";
import { FlowingWorkflow } from "@domains/flowing/components/FlowingWorkflow";
import { WorkflowBindDialog } from "@domains/flowing/components/WorkflowBindDialog";
import { WorkflowProgress } from "@domains/flowing/components/WorkflowProgress";
import { useWorkflowSSE } from "@domains/flowing/hooks/useWorkflowSSE";

function useFlowingMeta(cwd: string) {
	const [flowingId, setFlowingId] = useState<number | null>(null);
	const [workflowInstanceId, setWorkflowInstanceId] = useState<number | null>(null);

	useEffect(() => {
		void window.vetta.flowing.readMeta(cwd).then((meta) => {
			if (meta && meta.type === "flowing" && typeof meta.flowingId === "number") {
				setFlowingId(meta.flowingId);
			} else {
				setFlowingId(null);
			}
			if (meta && typeof meta.workflowInstanceId === "number") {
				setWorkflowInstanceId(meta.workflowInstanceId);
			} else {
				setWorkflowInstanceId(null);
			}
		});
	}, [cwd]);

	return { flowingId, workflowInstanceId };
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

function formatDate(ts: number): string {
	const d = new Date(ts);
	return d.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

function getProjectTypeLabel(project: { type: "normal" | "flowing" | "schedule" | "batch"; workflowInstanceId?: number } | undefined): string | null {
	if (!project) return null;
	if (project.type === "schedule") return "自动化";
	if (project.type === "batch") return "批量任务";
	if (project.type === "flowing") {
		return typeof project.workflowInstanceId === "number" ? "工作流" : "流转";
	}
	return null;
}

function useProjectDetail(cwd: string) {
	const projects = useAtomValue(projectsAtom);
	const sessionsMap = useAtomValue(sessionsMapAtom);
	const batchProjects = useAtomValue(batchProjectsAtom);

	// Check if this is a batch project (may not be in projectsAtom)
	const bp = batchProjects.find((b) => b.id === cwd);
	if (bp) {
		const project = projects.find((p) => p.cwd === cwd) ?? {
			cwd,
			name: bp.name,
			sessionCount: 0,
			type: "batch" as const,
		};
		const count = bp.tasks.filter((t) => t.sessionPath).length;
		return { project, sessionCount: count, batchProject: bp };
	}

	const project = projects.find((p) => p.cwd === cwd);
	const sessions = sessionsMap.get(cwd) ?? [];
	return { project, sessionCount: sessions.length, batchProject: null };
}

function useAgentsMd(cwd: string) {
	const [content, setContent] = useState("");
	const [original, setOriginal] = useState("");
	const [loading, setLoading] = useState(true);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

	const filePath = `${cwd}/AGENTS.md`;

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const result = await window.vetta.fs.readFile(filePath);
			setContent(result.content);
			setOriginal(result.content);
		} catch {
			// File doesn't exist yet
			setContent("");
			setOriginal("");
		}
		setLoading(false);
	}, [filePath]);

	useEffect(() => {
		void load();
	}, [load]);

	const save = useCallback(async () => {
		setSaveStatus("saving");
		try {
			await window.vetta.fs.writeFile(filePath, content);
			setOriginal(content);
			setSaveStatus("saved");
			setTimeout(() => setSaveStatus("idle"), 2000);
		} catch {
			setSaveStatus("error");
			setTimeout(() => setSaveStatus("idle"), 3000);
		}
	}, [filePath, content]);

	const isDirty = content !== original;

	return { content, setContent, loading, save, saveStatus, isDirty };
}

function useCreatedAt(cwd: string) {
	const [createdAt, setCreatedAt] = useState<number | null>(null);

	useEffect(() => {
		void window.vetta.fs.stat(cwd).then((result) => {
			if (result) setCreatedAt(result.createdAt);
		});
	}, [cwd]);

	return createdAt;
}

export function ProjectDetailPage(): JSX.Element {
	const { cwd } = useParams({ strict: false }) as { cwd: string };
	const decodedCwd = decodeURIComponent(cwd);

	const token = useAtomValue(authTokenAtom);
	const { project, sessionCount, batchProject } = useProjectDetail(decodedCwd);
	const createdAt = useCreatedAt(decodedCwd);
	const { flowingId, workflowInstanceId } = useFlowingMeta(decodedCwd);
	const { content, setContent, loading, save, saveStatus, isDirty } = useAgentsMd(decodedCwd);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [bindDialogOpen, setBindDialogOpen] = useState(false);
	const workflowInstance = useAtomValue(workflowInstanceAtom);
	const setWorkflowInstance = useSetAtom(workflowInstanceAtom);
	const isPersonal = useAtomValue(isPersonalModeAtom);
	const [activityOpen, setActivityOpen] = useAtom(activityPanelOpenAtom);
	const setConfirm = useSetAtom(confirmDialogAtom);

	// 监听工作流 SSE 事件
	useWorkflowSSE();

	// 加载工作流实例
	useEffect(() => {
		if (!token || !flowingId || !workflowInstanceId) {
			setWorkflowInstance(null);
			return;
		}
		void fetchWorkflowInstanceByFlowing(token, flowingId)
			.then((inst) => setWorkflowInstance(inst))
			.catch(() => setWorkflowInstance(null));
	}, [token, flowingId, workflowInstanceId, setWorkflowInstance]);

	const displayName = project?.name ?? pathBasename(decodedCwd);
	const isBatch = !!batchProject;

	const projectTypeLabel = getProjectTypeLabel(project);

	// New session handler
	const handleNewSession = () => {
		if (openSessionFnRef.current) {
			void openSessionFnRef.current(decodedCwd);
		}
	};

	// Export handler — only normal/batch are exportable; flowing/schedule hide the button.
	const exportable = project?.type === "normal" || project?.type === "batch" || isBatch;
	const handleExportProject = useCallback(() => {
		setConfirm({
			title: "导出项目",
			message: `确定要导出项目「${displayName}」吗？\n\n将打包当前项目目录下的所有文件，包括 .vetta/sessions 历史、batch 任务工作目录与状态。文件锁（*.lock）会被排除。`,
			confirmLabel: "导出",
			variant: "default",
			onConfirm: async () => {
				const result = await window.vetta.project.export(decodedCwd);
				if (result && "error" in result) {
					setConfirm({
						title: "导出失败",
						message: result.error.message,
						confirmLabel: "好的",
						variant: "danger",
						onConfirm: () => {},
					});
				}
				// Success path: native save dialog already gave feedback.
			},
		});
	}, [decodedCwd, displayName, setConfirm]);

	// Keyboard shortcut: Cmd/Ctrl+S to save
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === "s") {
				e.preventDefault();
				if (isDirty) void save();
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isDirty, save]);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			{/* Drag region */}
			<div className="drag-region h-12 shrink-0" />
			<div className="flex min-h-0 flex-1">
				<div className="flex min-w-0 flex-1 flex-col">
			{/* Hero header */}
			<div className="shrink-0 px-8 pb-6">
				{/* Top row: badge + actions */}
				<div className="mb-4 flex items-center justify-between">
					<div className="flex items-center gap-2">
						{projectTypeLabel && (
							<span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
								{projectTypeLabel}
							</span>
						)}
						{!isPersonal && project?.type === "normal" && !workflowInstance && (
							<Button
								variant="ghost"
								size="xs"
								className="gap-1 text-muted-foreground/60 hover:text-foreground"
								onClick={() => setBindDialogOpen(true)}
							>
								<span className="icon-[mdi--sitemap-outline] text-xs" />
								<span className="text-[10px]">绑定工作流</span>
							</Button>
						)}
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							className="gap-1.5 rounded-lg border-border/50 text-muted-foreground/70 transition-all duration-200 hover:border-foreground/20 hover:text-foreground"
							onClick={() => void window.vetta.shell.showInFolder(decodedCwd)}
							title={isMac ? "在 Finder 中显示" : "在资源管理器中显示"}
						>
							<span className="icon-[mdi--folder-open-outline] h-3.5 w-3.5" />
							<span className="text-[12px]">{isMac ? "Finder" : "资源管理器"}</span>
						</Button>
						{exportable && (
							<Button
								variant="outline"
								size="sm"
								className="gap-1.5 rounded-lg border-border/50 text-muted-foreground/70 transition-all duration-200 hover:border-foreground/20 hover:text-foreground"
								onClick={handleExportProject}
								title="导出项目（含会话历史）"
							>
								<span className="icon-[mdi--export-variant] h-3.5 w-3.5" />
								<span className="text-[12px]">导出</span>
							</Button>
						)}
						<Button
							size="sm"
							className="gap-1.5 rounded-lg bg-foreground text-background transition-all duration-200 hover:bg-foreground/90"
							onClick={handleNewSession}
						>
							<span className="icon-[mdi--plus] h-4 w-4" />
							<span className="text-[12px] font-medium">新会话</span>
						</Button>
						<Button
							size="icon-xs"
							variant="ghost"
							title={activityOpen ? "关闭活动面板" : "打开活动面板"}
							onClick={() => setActivityOpen((o) => !o)}
							className={activityOpen ? "bg-accent text-foreground" : ""}
						>
							<span className="icon-[mdi--dock-right] text-[14px]" />
						</Button>
					</div>
				</div>

				{/* Project title */}
				<h1 className="mb-1.5 text-[28px] font-bold leading-tight tracking-tight text-foreground">
					{displayName}
				</h1>
				<p className="mb-4 truncate font-mono text-[11px] text-muted-foreground/40">{decodedCwd}</p>

				{/* Stat pills */}
				<div className="flex items-center gap-2">
					<StatPill icon="icon-[mdi--chat-outline]" value={`${sessionCount} 个会话`} />
					{createdAt && <StatPill icon="icon-[mdi--calendar-outline]" value={formatDate(createdAt)} />}
					{isBatch && (
						<StatPill
							icon="icon-[mdi--layers-outline]"
							value={`${batchProject.tasks.length} 个任务`}
						/>
					)}
				</div>
			</div>

			{/* Divider */}
			<div className="mx-8 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

			{/* Scrollable content area */}
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
				{/* Batch queue status (for batch projects only) */}
				{isBatch && (
					<div className="px-8 py-5">
						<BatchQueueStatus project={batchProject} />
					</div>
				)}

				{/* Schedule status (for schedule projects only) */}
				{project?.type === "schedule" && <ScheduleStatus cwd={decodedCwd} />}

				{/* Flowing workflow (for flowing projects only) */}
				{project?.type === "flowing" && flowingId && (
					<div className="px-8 py-5">
						<FlowingWorkflow flowingId={flowingId} />
					</div>
				)}

				{/* Workflow progress */}
				{!isPersonal && workflowInstance && (
					<div className="px-8 py-5">
						<WorkflowProgress instance={workflowInstance} />
					</div>
				)}

				{/* AGENTS.md editor section */}
				<div className="flex min-h-[300px] flex-1 flex-col px-8 py-5">
					<div className="mb-3 flex items-center justify-between">
						<div className="flex items-center gap-2.5">
							<div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/60">
								<span className="icon-[mdi--file-document-edit-outline] h-3.5 w-3.5 text-muted-foreground" />
							</div>
							<h2 className="text-[13px] font-semibold text-foreground">AGENTS.md</h2>
							{isDirty && (
								<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ring" title="未保存的更改" />
							)}
						</div>
						<div className="flex items-center gap-2.5">
							{saveStatus === "saved" && (
								<span className="animate-in fade-in text-[12px] font-medium text-emerald-400/90">
									已保存
								</span>
							)}
							{saveStatus === "error" && (
								<span className="animate-in fade-in text-[12px] font-medium text-destructive">
									保存失败
								</span>
							)}
							<Button
								variant="outline"
								size="sm"
								className="gap-1.5 rounded-lg border-border/50 transition-all duration-200 hover:border-foreground/20"
								onClick={() => void save()}
								disabled={!isDirty || saveStatus === "saving"}
							>
								{saveStatus === "saving" ? (
									<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
								) : (
									<span className="icon-[mdi--content-save-outline] h-3.5 w-3.5" />
								)}
								保存
							</Button>
						</div>
					</div>

					{loading ? (
						<div className="flex flex-1 items-center justify-center">
							<span className="icon-[mdi--loading] h-5 w-5 animate-spin text-muted-foreground/50" />
						</div>
					) : (
						<div className="group relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/30 bg-muted/15 transition-colors duration-300 focus-within:border-ring/30 focus-within:bg-muted/25">
							<textarea
								ref={textareaRef}
								value={content}
								onChange={(e) => setContent(e.target.value)}
								placeholder="在此编写 AGENTS.md 项目指令..."
								spellCheck={false}
								className="min-h-0 flex-1 resize-none bg-transparent px-5 py-4 font-mono text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/25 focus:outline-none"
							/>
						</div>
					)}

					<p className="mt-3 text-[11px] text-muted-foreground/40">
						AGENTS.md 用于定义项目级别的 AI 指令，所有会话都会自动加载此文件。
						<kbd className="ml-1 rounded border border-border/30 bg-accent/30 px-1 py-0.5 font-mono text-[10px] text-muted-foreground/50">
							{isMac ? "⌘" : "Ctrl"}+S
						</kbd>
						{" "}快速保存
					</p>
				</div>
			</div>

				</div>
				<ActivityPanel cwd={decodedCwd} />
			</div>

			{/* Workflow bind dialog (enterprise only) */}
			{!isPersonal && (
				<WorkflowBindDialog
					open={bindDialogOpen}
					onOpenChange={setBindDialogOpen}
					projectDir={decodedCwd}
					projectName={displayName}
					flowingId={flowingId ?? undefined}
				/>
			)}
		</div>
	);
}

function StatPill({ icon, value }: { icon: string; value: string }): JSX.Element {
	return (
		<div className="flex items-center gap-1.5 rounded-lg bg-accent/40 px-2.5 py-1.5 text-[12px] text-muted-foreground/70 transition-colors duration-200 hover:bg-accent/60">
			<span className={`${icon} h-3.5 w-3.5 opacity-50`} />
			<span>{value}</span>
		</div>
	);
}
