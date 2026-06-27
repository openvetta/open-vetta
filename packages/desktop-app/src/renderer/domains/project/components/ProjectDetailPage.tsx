import { useNavigate, useParams } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import {
	activityPanelOpenAtom,
	authTokenAtom,
	batchProjectsAtom,
	confirmDialogAtom,
	isPersonalModeAtom,
	pageHeaderTitleHiddenAtom,
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

function formatDate(ts: number, locale: string): string {
	const d = new Date(ts);
	return d.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
}

function getProjectTypeKey(
	project: { type: "normal" | "flowing" | "batch"; workflowInstanceId?: number } | undefined,
): "detail.typeBatch" | "detail.typeWorkflow" | "detail.typeFlowing" | null {
	if (!project) return null;
	if (project.type === "batch") return "detail.typeBatch";
	if (project.type === "flowing") {
		return typeof project.workflowInstanceId === "number" ? "detail.typeWorkflow" : "detail.typeFlowing";
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

const easeOut = [0.22, 1, 0.36, 1] as const;

export function ProjectDetailPage(): JSX.Element {
	const { t, i18n } = useTranslation("project");
	const dateLocale = i18n.language === "zh" ? "zh-CN" : "en-US";
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
	const setHeaderTitleHidden = useSetAtom(pageHeaderTitleHiddenAtom);
	const [editorFocused, setEditorFocused] = useState(false);
	const navigate = useNavigate();

	// 项目详情页不显示顶栏左上角的「项目详情」标题。
	useEffect(() => {
		setHeaderTitleHidden(true);
		return () => setHeaderTitleHidden(false);
	}, [setHeaderTitleHidden]);

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

	const projectTypeKey = getProjectTypeKey(project);
	const projectTypeLabel = projectTypeKey ? t(projectTypeKey) : null;

	// New session handler — 跳转到 NewSession 页面，由用户在该页发起首条消息再创建会话
	const handleNewSession = () => {
		void navigate({ to: "/new-session/$cwd", params: { cwd: encodeURIComponent(decodedCwd) } });
	};

	// Export handler — only normal/batch are exportable; flowing hides the button.
	const exportable = project?.type === "normal" || project?.type === "batch" || isBatch;
	const handleExportProject = useCallback(() => {
		setConfirm({
			title: t("exportDialog.title"),
			message: t("exportDialog.message", { name: displayName }),
			confirmLabel: t("exportDialog.confirm"),
			variant: "default",
			onConfirm: async () => {
				const result = await window.vetta.project.export(decodedCwd);
				if (result && "error" in result) {
					setConfirm({
						title: t("exportDialog.failedTitle"),
						message: result.error.message,
						confirmLabel: t("exportDialog.failedConfirm"),
						variant: "danger",
						onConfirm: () => {},
					});
				}
				// Success path: native save dialog already gave feedback.
			},
		});
	}, [decodedCwd, displayName, setConfirm, t]);

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
				<div className="relative flex min-w-0 flex-1 flex-col">
					{/* Hero header */}
					<div className="relative shrink-0 px-10 pt-0 pb-5">
						{/* Top row: badge + actions */}
						<motion.div
							className="mb-3 flex items-center justify-between"
							initial={{ opacity: 0, y: -8 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.5, ease: easeOut }}
						>
							<div className="flex items-center gap-2.5">
								<AnimatePresence mode="popLayout">
									{projectTypeLabel && (
										<motion.span
											key={projectTypeLabel}
											initial={{ opacity: 0, scale: 0.85, y: -4 }}
											animate={{ opacity: 1, scale: 1, y: 0 }}
											exit={{ opacity: 0, scale: 0.85, y: -4 }}
											transition={{ type: "spring", stiffness: 380, damping: 26 }}
											className="relative inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary"
										>
											<span className="relative flex h-1.5 w-1.5">
												<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
												<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
											</span>
											{projectTypeLabel}
										</motion.span>
									)}
								</AnimatePresence>
								{!isPersonal && project?.type === "normal" && !workflowInstance && (
									<motion.div
										initial={{ opacity: 0, x: -6 }}
										animate={{ opacity: 1, x: 0 }}
										transition={{ delay: 0.15, duration: 0.4, ease: easeOut }}
									>
										<Button
											variant="ghost"
											size="xs"
											className="gap-1 rounded-full text-muted-foreground/60 hover:bg-primary/8 hover:text-primary"
											onClick={() => setBindDialogOpen(true)}
										>
											<span className="icon-[mdi--sitemap-outline] text-xs" />
											<span className="text-[10px]">{t("detail.bindWorkflow")}</span>
										</Button>
									</motion.div>
								)}
							</div>
							<motion.div
								className="flex items-center gap-2"
								initial="hidden"
								animate="show"
								variants={{
									hidden: {},
									show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
								}}
							>
								<ActionButton
									variant="outline"
									onClick={() => void window.vetta.shell.showInFolder(decodedCwd)}
									title={isMac ? t("detail.showInFinder") : t("detail.showInExplorer")}
								>
									<span className="icon-[solar--folder-open-linear] h-3.5 w-3.5" />
									<span className="text-[12px]">{isMac ? t("detail.finder") : t("detail.explorer")}</span>
								</ActionButton>
								{exportable && (
									<ActionButton
										variant="outline"
										onClick={handleExportProject}
										title={t("detail.exportTitle")}
									>
										<span className="icon-[solar--export-linear] h-3.5 w-3.5" />
										<span className="text-[12px]">{t("detail.export")}</span>
									</ActionButton>
								)}
								<motion.div
									variants={{
										hidden: { opacity: 0, y: -6, scale: 0.96 },
										show: { opacity: 1, y: 0, scale: 1 },
									}}
									transition={{ type: "spring", stiffness: 380, damping: 26 }}
									whileHover={{ scale: 1.04, y: -1 }}
									whileTap={{ scale: 0.96 }}
								>
									<Button
										variant="primary"
										size="sm"
										onClick={handleNewSession}
									>
										<span className="icon-[solar--add-circle-linear] h-4 w-4" />
										<span className="text-[12px] font-medium">{t("detail.newSession")}</span>
									</Button>
								</motion.div>
								<motion.div
									variants={{
										hidden: { opacity: 0, y: -6, scale: 0.96 },
										show: { opacity: 1, y: 0, scale: 1 },
									}}
									transition={{ type: "spring", stiffness: 380, damping: 26 }}
									whileHover={{ scale: 1.08 }}
									whileTap={{ scale: 0.92 }}
								>
									<Button
										size="icon-xs"
										variant={activityOpen ? "secondary" : "ghost"}
										title={activityOpen ? t("detail.closeActivityPanel") : t("detail.openActivityPanel")}
										onClick={() => setActivityOpen((o) => !o)}
									>
										<span className="icon-[solar--sidebar-minimalistic-linear] -scale-x-100 text-[14px]" />
									</Button>
								</motion.div>
							</motion.div>
						</motion.div>

						{/* Project title */}
						<motion.h1
							className="mb-1.5 bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-[30px] font-bold leading-[1.1] tracking-tight text-transparent"
							initial={{ opacity: 0, y: 14 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.1, ease: easeOut }}
						>
							{displayName}
						</motion.h1>
						<motion.p
							className="mb-4 flex items-center gap-1.5 truncate font-mono text-[11px] text-muted-foreground/50"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ duration: 0.5, delay: 0.25 }}
						>
							<span className="icon-[mdi--folder-outline] h-3 w-3 opacity-60" />
							{decodedCwd}
						</motion.p>

						{/* Stat pills */}
						<motion.div
							className="flex flex-wrap items-center gap-2"
							initial="hidden"
							animate="show"
							variants={{
								hidden: {},
								show: { transition: { staggerChildren: 0.07, delayChildren: 0.3 } },
							}}
						>
							<StatPill icon="icon-[mdi--chat-outline]" value={t("detail.sessionCount", { count: sessionCount })} />
							{createdAt && <StatPill icon="icon-[mdi--calendar-outline]" value={formatDate(createdAt, dateLocale)} />}
							{isBatch && (
								<StatPill
									icon="icon-[mdi--layers-outline]"
									value={t("detail.taskCount", { count: batchProject.tasks.length })}
								/>
							)}
						</motion.div>
					</div>

					{/* Divider */}
					<div className="relative mx-10 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

					{/* Scrollable content area */}
					<div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
						{/* Batch queue status (for batch projects only) */}
						{isBatch && (
							<motion.div
								className="px-10 py-6"
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.5, delay: 0.35, ease: easeOut }}
							>
								<BatchQueueStatus project={batchProject} />
							</motion.div>
						)}

						{/* Flowing workflow (for flowing projects only) */}
						{project?.type === "flowing" && flowingId && (
							<motion.div
								className="px-10 py-6"
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.5, delay: 0.35, ease: easeOut }}
							>
								<FlowingWorkflow flowingId={flowingId} />
							</motion.div>
						)}

						{/* Workflow progress */}
						{!isPersonal && workflowInstance && (
							<motion.div
								className="px-10 py-6"
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.5, delay: 0.4, ease: easeOut }}
							>
								<WorkflowProgress instance={workflowInstance} />
							</motion.div>
						)}

						{/* AGENTS.md editor section */}
						<motion.div
							className="flex min-h-[340px] flex-1 flex-col px-10 py-6"
							initial={{ opacity: 0, y: 16 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.45, ease: easeOut }}
						>
							<div className="mb-4 flex items-center justify-between">
								<div className="flex items-center gap-2.5">
									<motion.div
										className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-inset ring-primary/20"
										whileHover={{ rotate: -6, scale: 1.08 }}
										transition={{ type: "spring", stiffness: 320, damping: 18 }}
									>
										<span className="icon-[mdi--file-document-edit-outline] h-3.5 w-3.5 text-primary" />
									</motion.div>
									<h2 className="text-[13px] font-semibold tracking-tight text-foreground">
										{t("detail.persona")}
									</h2>
									<AnimatePresence>
										{isDirty && (
											<motion.span
												key="dirty"
												initial={{ opacity: 0, scale: 0 }}
												animate={{ opacity: 1, scale: 1 }}
												exit={{ opacity: 0, scale: 0 }}
												className="relative flex h-1.5 w-1.5"
												title={t("detail.unsavedChanges")}
											>
												<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
												<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
											</motion.span>
										)}
									</AnimatePresence>
								</div>
								<div className="flex items-center gap-2.5">
									<AnimatePresence mode="popLayout">
										{saveStatus === "saved" && (
											<motion.span
												key="saved"
												initial={{ opacity: 0, x: 6 }}
												animate={{ opacity: 1, x: 0 }}
												exit={{ opacity: 0, x: 6 }}
												className="flex items-center gap-1 text-[12px] font-medium text-emerald-400/90"
											>
												<span className="icon-[mdi--check-circle] h-3.5 w-3.5" />
												{t("detail.saved")}
											</motion.span>
										)}
										{saveStatus === "error" && (
											<motion.span
												key="error"
												initial={{ opacity: 0, x: 6 }}
												animate={{ opacity: 1, x: 0 }}
												exit={{ opacity: 0, x: 6 }}
												className="flex items-center gap-1 text-[12px] font-medium text-destructive"
											>
												<span className="icon-[mdi--alert-circle-outline] h-3.5 w-3.5" />
												{t("detail.saveFailed")}
											</motion.span>
										)}
									</AnimatePresence>
									<motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
										<Button
											variant="outline"
											size="sm"
											className="gap-1.5 rounded-full border-border/50 transition-all duration-200 hover:border-primary/40 hover:text-primary disabled:opacity-40"
											onClick={() => void save()}
											disabled={!isDirty || saveStatus === "saving"}
										>
											{saveStatus === "saving" ? (
												<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
											) : (
												<span className="icon-[mdi--content-save-outline] h-3.5 w-3.5" />
											)}
											{t("detail.save")}
										</Button>
									</motion.div>
								</div>
							</div>

							{loading ? (
								<div className="flex flex-1 items-center justify-center">
									<motion.span
										className="icon-[mdi--loading] h-5 w-5 text-primary/60"
										animate={{ rotate: 360 }}
										transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
									/>
								</div>
							) : (
								<motion.div
									className="group relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/40 bg-card/40 backdrop-blur-sm"
									animate={{
										borderColor: editorFocused
											? "color-mix(in oklab, var(--primary) 45%, transparent)"
											: "color-mix(in oklab, var(--border) 50%, transparent)",
									}}
									transition={{ duration: 0.35, ease: easeOut }}
								>
									{/* Subtle top accent bar */}
									<motion.div
										className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
										initial={{ opacity: 0, scaleX: 0.5 }}
										animate={{
											opacity: editorFocused ? 1 : 0.25,
											scaleX: editorFocused ? 1 : 0.6,
										}}
										transition={{ duration: 0.4, ease: easeOut }}
									/>
									<textarea
										ref={textareaRef}
										value={content}
										onChange={(e) => setContent(e.target.value)}
										onFocus={() => setEditorFocused(true)}
										onBlur={() => setEditorFocused(false)}
										placeholder={t("detail.editorPlaceholder")}
										spellCheck={false}
										className="min-h-0 flex-1 resize-none bg-transparent px-6 py-5 font-mono text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
									/>
								</motion.div>
							)}

							<p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
								<span className="icon-[mdi--information-outline] h-3 w-3 opacity-60" />
								{t("detail.agentsMdHint")}
								<kbd className="ml-1 rounded-md border border-border/40 bg-accent/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/70 shadow-sm">
									{isMac ? "⌘" : "Ctrl"}+S
								</kbd>
								<span>{t("detail.quickSave")}</span>
							</p>
						</motion.div>
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

function ActionButton({
	children,
	variant,
	onClick,
	title,
}: {
	children: React.ReactNode;
	variant: "outline";
	onClick: () => void;
	title?: string;
}): JSX.Element {
	return (
		<motion.div
			variants={{
				hidden: { opacity: 0, y: -6, scale: 0.96 },
				show: { opacity: 1, y: 0, scale: 1 },
			}}
			transition={{ type: "spring", stiffness: 380, damping: 26 }}
			whileHover={{ scale: 1.04, y: -1 }}
			whileTap={{ scale: 0.96 }}
		>
			<Button
				variant={variant}
				size="sm"
				onClick={onClick}
				title={title}
			>
				{children}
			</Button>
		</motion.div>
	);
}

function StatPill({ icon, value }: { icon: string; value: string }): JSX.Element {
	return (
		<motion.div
			variants={{
				hidden: { opacity: 0, y: 8, scale: 0.94 },
				show: { opacity: 1, y: 0, scale: 1 },
			}}
			transition={{ type: "spring", stiffness: 320, damping: 24 }}
			whileHover={{ y: -2, scale: 1.03 }}
			className="group flex items-center gap-1.5 rounded-full border border-border/40 bg-card/40 px-3 py-1.5 text-[12px] text-muted-foreground/80 backdrop-blur-sm transition-colors duration-200 hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
		>
			<span className={`${icon} h-3.5 w-3.5 opacity-60 transition-opacity group-hover:opacity-100`} />
			<span>{value}</span>
		</motion.div>
	);
}
