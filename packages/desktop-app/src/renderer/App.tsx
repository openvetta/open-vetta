import { useRef, useCallback, useEffect, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { Outlet, useMatches, useNavigate } from "@tanstack/react-router";
import { Sidebar } from "./domains/project/components/Sidebar";
import { ConfirmDialog } from "./shared/components/ui/confirm-dialog";
import { WindowControls } from "./shared/components/TitleBar";
import { LoginDialog } from "./domains/auth/components/LoginDialog";
import { FlowingSendDialog } from "./domains/flowing/components/FlowingSendDialog";
import { WorkflowCompleteDialog } from "./domains/flowing/components/WorkflowCompleteDialog";
import { useProjects } from "./domains/project/hooks/useProjects";
import { useTheme } from "./shared/hooks/useTheme";
import { useAuth } from "./domains/auth/hooks/useAuth";
import { useGlobalShortcuts } from "./shared/hooks/useShortcuts";
import { useUpdaterInit } from "./shared/hooks/useUpdaterInit";
import { useRunningSessionsSync } from "./shared/hooks/useRunningSessionsSync";
import { useNarrowScreen } from "./shared/hooks/useNarrowScreen";
import { useAppInit } from "./domains/chat/hooks/useAppInit";
import { useSessionManager } from "./domains/chat/hooks/useSessionManager";
import { useFlowingInit } from "./domains/flowing/hooks/useFlowingInit";
import { useNotificationInit } from "./domains/message/hooks/useNotificationInit";
import { useFlowingChatInit } from "./domains/flowing-chat/hooks/useFlowingChatInit";
import { useDownloadsInit } from "./domains/downloads/hooks/useDownloadsInit";
import { FilePreviewDialog } from "./domains/file-preview/components/FilePreviewDialog";
import { PluginGlobalSlotHost } from "./domains/plugins/components/PluginGlobalSlotHost";
import { UpdateRestartDialog } from "./shared/components/UpdateRestartDialog";
import { ActionApprovalCenter } from "./shared/action-approval/ActionApprovalCenter";
import { GenericActionApproval } from "./shared/action-approval/GenericActionApproval";
import { AppearancePickerApproval } from "./shared/action-approval/appearance/AppearancePickerApproval";
import { ThemeChangeApproval } from "./shared/action-approval/appearance/ThemeChangeApproval";
import { NavigationOpenApproval } from "./shared/action-approval/navigation/NavigationOpenApproval";
import { BatchTasksProjectApproval } from "./shared/action-approval/batch-tasks/BatchTasksProjectApproval";
import { BatchTasksTaskApproval } from "./shared/action-approval/batch-tasks/BatchTasksTaskApproval";
import { BatchTasksExecutionApproval } from "./shared/action-approval/batch-tasks/BatchTasksExecutionApproval";
import { SchedulerCreateApproval } from "./shared/action-approval/scheduler/SchedulerCreateApproval";
import { SchedulerUpdateApproval } from "./shared/action-approval/scheduler/SchedulerUpdateApproval";
import { SchedulerDeleteApproval } from "./shared/action-approval/scheduler/SchedulerDeleteApproval";
import { SchedulerToggleApproval } from "./shared/action-approval/scheduler/SchedulerToggleApproval";
import { SchedulerExecutionApproval } from "./shared/action-approval/scheduler/SchedulerExecutionApproval";
import { TooltipProvider } from "./shared/components/ui/tooltip";
import { Toaster } from "./shared/components/ui/Toaster";
import {
	activeSessionAtom,
	defaultConversationCwdAtom,
	lastActiveSessionAtom,
	pendingQuestionsAtom,
	sandboxPermissionDrawerAtom,
	scheduledSessionPathsAtom,
	sidebarCollapsedAtom,
	pageHeaderTitleAtom,
	pageHeaderTitleHiddenAtom,
	pageHeaderTitleBadgeAtom,
	pageHeaderRightSlotAtom,
	pageHeaderLeftSlotAtom,
} from "./shared/store/atoms";
import { isMac } from "./shared/lib/platform";
import { cn } from "./shared/lib/utils";
import { KnowledgeDropOverlay } from "./domains/knowledge-base/components/KnowledgeDropOverlay";

const ROUTE_TITLES: Array<{ match: RegExp; title: string }> = [
	{ match: /^\/automation$/, title: "自动化" },
	{ match: /^\/batch-tasks$/, title: "批量任务" },
	{ match: /^\/knowledge\/all$/, title: "全部知识库" },
	{ match: /^\/knowledge$/, title: "知识库" },
	{ match: /^\/skills$/, title: "技能广场" },
	{ match: /^\/settings\b/, title: "设置" },
	{ match: /^\/project\b/, title: "项目详情" },
	{ match: /^\/downloads$/, title: "下载中心" },
	{ match: /^\/$/, title: "对话" },
];

function PageHeader({
	sidebarCollapsed,
	narrow,
	onExpandSidebar,
	onOverlayOpen,
	onOverlayClose,
}: {
	sidebarCollapsed: boolean;
	narrow: boolean;
	onExpandSidebar: () => void;
	onOverlayOpen: () => void;
	onOverlayClose: () => void;
}): JSX.Element {
	const matches = useMatches();
	const path = matches[matches.length - 1]?.pathname ?? "/";
	const titleOverride = useAtomValue(pageHeaderTitleAtom);
	const titleHidden = useAtomValue(pageHeaderTitleHiddenAtom);
	const titleBadge = useAtomValue(pageHeaderTitleBadgeAtom);
	const rightSlot = useAtomValue(pageHeaderRightSlotAtom);
	const leftSlot = useAtomValue(pageHeaderLeftSlotAtom);
	const fallbackTitle = ROUTE_TITLES.find((r) => r.match.test(path))?.title ?? "Vetta";
	const title = titleOverride && titleOverride.length > 0 ? titleOverride : fallbackTitle;
	// 窄屏始终显示触发按钮（悬浮即唤出浮层）；宽屏仅在手动收起时显示。
	const triggerVisible = narrow || sidebarCollapsed;

	return (
		<div
			className={cn("drag-region relative flex h-11 shrink-0 items-center justify-between gap-2",
				!isMac && "h-8"
			)}
			style={{
				paddingLeft: isMac && triggerVisible ? 78 : 12,
				paddingRight: isMac ? 12 : 0,
				marginBottom: isMac ? 0 : 10
			}}
		>
			<div className="no-drag flex min-w-0 items-center gap-2">
				<AnimatePresence initial={false}>
					{triggerVisible && (
						<motion.button
							key="expand"
							type="button"
							onClick={narrow ? onOverlayOpen : onExpandSidebar}
							onMouseEnter={narrow ? onOverlayOpen : undefined}
							onMouseLeave={narrow ? onOverlayClose : undefined}
							initial={{ opacity: 0, scale: 0.85, width: 0 }}
							animate={{ opacity: 1, scale: 1, width: 28 }}
							exit={{ opacity: 0, scale: 0.85, width: 0 }}
							transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
							title={narrow ? "侧边栏" : "展开侧边栏"}
							className="flex h-7 shrink-0 items-center justify-center overflow-hidden rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							<span className="icon-[solar--sidebar-minimalistic-linear] h-4 w-4" />
						</motion.button>
					)}
				</AnimatePresence>
				{leftSlot}
				{!titleHidden && (
					<motion.h1
						key={title}
						initial={{ opacity: 0, y: 2 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.18 }}
						className="drag-region min-w-0 select-none truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground"
					>
						{title}
					</motion.h1>
				)}
				{titleBadge}
			</div>
			<div className="no-drag flex shrink-0 items-center gap-1">
				{rightSlot}
				{!isMac && <WindowControls />}
			</div>
		</div>
	);
}

export function RootLayout(): JSX.Element {
	const { openProject, projects, ensureLocalSession } = useProjects();
	const navigate = useNavigate();
	const setSandboxPermissionDrawer = useSetAtom(sandboxPermissionDrawerAtom);
	const defaultConversationCwd = useAtomValue(defaultConversationCwdAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const setActiveSession = useSetAtom(activeSessionAtom);
	const [lastActiveSession, setLastActiveSession] = useAtom(lastActiveSessionAtom);
	const matchesForGuard = useMatches();
	const currentPath = matchesForGuard[matchesForGuard.length - 1]?.pathname ?? "/";
	const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
	const [sessionRestoreState, setSessionRestoreState] = useState<"pending" | "restoring" | "complete">("pending");
	const sessionRestoreAttemptedRef = useRef(false);
	const toggleSidebar = useCallback(() => {
		setSidebarCollapsed((v) => !v);
	}, [setSidebarCollapsed]);

	// 响应式侧边栏：窄屏时不挤压布局，改为悬浮浮层（hover 唤出，移出即隐藏）。
	const narrow = useNarrowScreen();
	const [overlayOpen, setOverlayOpen] = useState(false);
	const overlayCloseTimerRef = useRef<number | null>(null);
	const cancelOverlayClose = useCallback(() => {
		if (overlayCloseTimerRef.current != null) {
			window.clearTimeout(overlayCloseTimerRef.current);
			overlayCloseTimerRef.current = null;
		}
	}, []);
	const openOverlay = useCallback(() => {
		cancelOverlayClose();
		setOverlayOpen(true);
	}, [cancelOverlayClose]);
	const closeOverlay = useCallback(() => {
		cancelOverlayClose();
		setOverlayOpen(false);
	}, [cancelOverlayClose]);
	// 触发按钮 → 浮层之间留出短暂宽限，避免指针经过间隙时闪烁。
	const scheduleOverlayClose = useCallback(() => {
		cancelOverlayClose();
		overlayCloseTimerRef.current = window.setTimeout(() => setOverlayOpen(false), 120);
	}, [cancelOverlayClose]);
	// 退出窄屏时复位浮层状态。
	useEffect(() => {
		if (!narrow) {
			cancelOverlayClose();
			setOverlayOpen(false);
		}
	}, [narrow, cancelOverlayClose]);

	useTheme();
	useAuth();
	useAppInit();
	useFlowingInit();
	useNotificationInit();
	useFlowingChatInit();
	useDownloadsInit();
	useUpdaterInit();
	// 全局 running-sessions 订阅必须挂在始终挂载的 App 上：它是 streaming 状态真值
	// 来源之一，挂在会被卸载的 Sidebar 上会在卸载期间丢 RUNNING_CHANGED 事件。
	useRunningSessionsSync();
	const { openSession } = useSessionManager();

	// 刷新根路由时先用持久化的 cwd + sessionPath 重建 runtime session。
	// runtimeId 不能跨 renderer 生命周期复用，必须重新走 openSession/session.create。
	useEffect(() => {
		if (
			currentPath !== "/" ||
			!defaultConversationCwd ||
			sessionRestoreAttemptedRef.current
		) {
			return;
		}
		sessionRestoreAttemptedRef.current = true;
		if (activeSession || !lastActiveSession) {
			setSessionRestoreState("complete");
			return;
		}
		setSessionRestoreState("restoring");
		void openSession(lastActiveSession.cwd, lastActiveSession.sessionPath)
			.catch((error: unknown) => {
				console.warn("[RootLayout] restore active session failed", error);
				setActiveSession(null);
				setLastActiveSession(null);
			})
			.finally(() => setSessionRestoreState("complete"));
	}, [
		currentPath,
		defaultConversationCwd,
		activeSession,
		lastActiveSession,
		openSession,
		setActiveSession,
		setLastActiveSession,
	]);

	// 路由守卫：仅在确认没有可恢复会话后，才跳到默认「对话」项目的 NewSession 页。
	useEffect(() => {
		if (
			currentPath !== "/" ||
			activeSession ||
			!defaultConversationCwd ||
			sessionRestoreState !== "complete"
		) {
			return;
		}
		void navigate({
			to: "/new-session/$cwd",
			params: { cwd: encodeURIComponent(defaultConversationCwd) },
		});
	}, [currentPath, activeSession, defaultConversationCwd, sessionRestoreState, navigate]);

	// 上报「聊天页当前所在 session」给主进程：仅在聊天路由 "/" 且有 activeSession
	// 时报其 sessionPath，否则 null。主进程据此 + 窗口聚焦态做系统通知抑制判定。
	useEffect(() => {
		const sessionPath = currentPath === "/" ? activeSession?.sessionPath || null : null;
		void window.vetta.notification.setForegroundSession(sessionPath);
	}, [currentPath, activeSession]);

	// 点击系统通知 → 主进程已前台化窗口，这里把对应 session 打开并路由到聊天页。
	useEffect(() => {
		return window.vetta.notification.onNavigate((payload) => {
			if (payload.type === "agent-turn-complete" || payload.type === "agent-question-pending") {
				void openSession(payload.cwd, payload.sessionPath);
			}
		});
	}, [openSession]);

	const confirmationQueueRef = useRef<Parameters<Parameters<typeof window.vetta.session.onConfirmationRequest>[0]>[0][]>(
		[],
	);
	const confirmationActiveRef = useRef(false);

	useEffect(() => {
		const showRequest = (request: Parameters<Parameters<typeof window.vetta.session.onConfirmationRequest>[0]>[0]) => {
			confirmationActiveRef.current = true;
			const showNext = () => {
				const nextRequest = confirmationQueueRef.current.shift();
				if (nextRequest) {
					showRequest(nextRequest);
				} else {
					confirmationActiveRef.current = false;
				}
			};
			setSandboxPermissionDrawer({
				requestId: request.requestId,
				title: request.title,
				message: request.message,
				onConfirm: () => {
					void window.vetta.session.respondToConfirmation(request.requestId, true);
					setSandboxPermissionDrawer(null);
					showNext();
				},
				onCancel: () => {
					void window.vetta.session.respondToConfirmation(request.requestId, false);
					setSandboxPermissionDrawer(null);
					showNext();
				},
			});
		};
		return window.vetta.session.onConfirmationRequest((request) => {
			if (confirmationActiveRef.current) {
				confirmationQueueRef.current.push(request);
				return;
			}
			showRequest(request);
		});
	}, [setSandboxPermissionDrawer]);

	// ask_user_question：把提问请求按 sessionId 存入 pendingQuestionsAtom，
	// 由对应 session 的 InputBar 接管为「问答面板」。不在此弹全局框（与 confirm 不同）。
	const setPendingQuestions = useSetAtom(pendingQuestionsAtom);
	useEffect(() => {
		return window.vetta.session.onQuestionRequest((request) => {
			setPendingQuestions((prev) => ({ ...prev, [request.sessionId]: request }));
		});
	}, [setPendingQuestions]);

	const grantQueueRef = useRef<Parameters<Parameters<typeof window.vetta.session.onSandboxGrantRequest>[0]>[0][]>([]);
	const grantActiveRef = useRef(false);

	useEffect(() => {
		const showGrant = (
			request: Parameters<Parameters<typeof window.vetta.session.onSandboxGrantRequest>[0]>[0],
		) => {
			grantActiveRef.current = true;
			const showNext = () => {
				const nextRequest = grantQueueRef.current.shift();
				if (nextRequest) {
					showGrant(nextRequest);
				} else {
					grantActiveRef.current = false;
				}
			};
			setSandboxPermissionDrawer({
				requestId: request.requestId,
				title: request.title,
				message: request.message,
				sensitive: request.sensitive,
				onConfirm: () => {
					void window.vetta.session.respondToSandboxGrant(request.requestId, "allow_once");
					setSandboxPermissionDrawer(null);
					showNext();
				},
				onCancel: () => {
					void window.vetta.session.respondToSandboxGrant(request.requestId, "deny");
					setSandboxPermissionDrawer(null);
					showNext();
				},
				onAllowSession: request.sensitive
					? undefined
					: () => {
							void window.vetta.session.respondToSandboxGrant(request.requestId, "allow_session");
							setSandboxPermissionDrawer(null);
							showNext();
						},
			});
		};
		return window.vetta.session.onSandboxGrantRequest((request) => {
			if (grantActiveRef.current || confirmationActiveRef.current) {
				grantQueueRef.current.push(request);
				return;
			}
			showGrant(request);
		});
	}, [setSandboxPermissionDrawer]);

	// 调度任务（自动化）"立即执行"时，session 在 main 进程已经建好，但 JSONL
	// 要等 assistant 首个回复才落盘。这里订阅 task.started，乐观地把 session
	// 插入 sidebar，避免必须等 agent 跑完才出现的延迟。
	const setScheduledSessionPaths = useSetAtom(scheduledSessionPathsAtom);
	useEffect(() => {
		// 启动时拉取已有定时 session 路径，供侧栏识别并挂图标。
		void window.vetta.scheduler.getScheduledSessionPaths().then((paths) => {
			setScheduledSessionPaths(new Set(paths));
		});
		return window.vetta.scheduler.onTaskEvent((event) => {
			if (event.type !== "task.started") return;
			if (!event.sessionPath || !event.cwd) return;
			setScheduledSessionPaths((prev) => new Set(prev).add(event.sessionPath));
			ensureLocalSession(event.cwd, {
				id: event.sessionId,
				path: event.sessionPath,
				cwd: event.cwd,
				name: event.sessionName,
				firstMessage: event.firstMessage,
				modifiedAt: Date.now(),
			});
		});
	}, [ensureLocalSession, setScheduledSessionPaths]);

	// ─── Global keyboard shortcuts ───
	const projectsRef = useRef(projects);
	projectsRef.current = projects;

	const defaultCwdRef = useRef(defaultConversationCwd);
	defaultCwdRef.current = defaultConversationCwd;

	useGlobalShortcuts(
		useCallback(
			(actionId: string) => {
				switch (actionId) {
					case "new-session": {
						// 默认走「对话」项目的 NewSession 页面；若主进程尚未返回 cwd，退回第一个项目。
						const target = defaultCwdRef.current || projectsRef.current[0]?.cwd;
						if (target) {
							void navigate({
								to: "/new-session/$cwd",
								params: { cwd: encodeURIComponent(target) },
							});
						}
						break;
					}
					case "open-project": {
						void openProject();
						break;
					}
					case "open-settings": {
						void navigate({ to: "/settings/$tab", params: { tab: "account" } });
						break;
					}
				}
			},
			[openProject, navigate],
		),
	);

	return (
		<TooltipProvider>
			<div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
				<div className="relative flex flex-1 gap-2 overflow-hidden p-2">
					<AnimatePresence initial={false}>
						{!narrow && !sidebarCollapsed && (
							<motion.div
								key="sidebar"
								initial={{ width: 0, opacity: 0, marginRight: -8 }}
								animate={{ width: "auto", opacity: 1, marginRight: 0 }}
								exit={{ width: 0, opacity: 0, marginRight: -8 }}
								transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
								className="overflow-hidden"
							>
								<Sidebar onOpenSession={openSession} onCollapse={toggleSidebar} />
							</motion.div>
						)}
					</AnimatePresence>
					{/* 窄屏悬浮侧边栏：绝对定位覆盖在内容之上，不挤压布局；移出即隐藏 */}
					<AnimatePresence>
						{narrow && overlayOpen && (
							<motion.div
								key="sidebar-overlay"
								initial={{ opacity: 0, x: -12 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: -12 }}
								transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
								onMouseEnter={openOverlay}
								// 缓冲关闭：浮层四周留有 8px 缝，且关闭时会露出 PageHeader 触发按钮。
								// 指针在顶部边缘微动会反复穿越「浮层↔缝/触发按钮」，若立即关闭便与触发
								// 按钮的重新打开形成 open/close 抖动。改用 120ms 宽限，re-enter 即取消。
								onMouseLeave={scheduleOverlayClose}
								// no-drag：挖掉浮层脚下 PageHeader 的 -webkit-app-region: drag，
								// 否则与其重叠的区域鼠标事件被 OS 拖拽区吞掉，触发 mouseleave 误隐藏。
								className="no-drag absolute inset-y-2 left-2 z-50 overflow-hidden rounded-[10px] shadow-2xl shadow-black/30"
							>
								<Sidebar onOpenSession={openSession} onCollapse={closeOverlay} floating />
							</motion.div>
						)}
					</AnimatePresence>
					<main className="relative flex min-w-[320px] flex-1 flex-col overflow-hidden bg-transparent">
						<PageHeader
							sidebarCollapsed={sidebarCollapsed}
							narrow={narrow}
							onExpandSidebar={toggleSidebar}
							onOverlayOpen={openOverlay}
							onOverlayClose={scheduleOverlayClose}
						/>
						<div className="flex flex-1 overflow-hidden">
							<Outlet />
						</div>
					</main>
					<ConfirmDialog />
					<LoginDialog />
					<FlowingSendDialog />
					<WorkflowCompleteDialog />
					<FilePreviewDialog />
					<UpdateRestartDialog />
					<ActionApprovalCenter />
					<GenericActionApproval />
					<AppearancePickerApproval />
					<ThemeChangeApproval />
					<NavigationOpenApproval />
					<BatchTasksProjectApproval />
					<BatchTasksTaskApproval />
					<BatchTasksExecutionApproval />
					<SchedulerCreateApproval />
					<SchedulerUpdateApproval />
					<SchedulerDeleteApproval />
					<SchedulerToggleApproval />
					<SchedulerExecutionApproval />
					<PluginGlobalSlotHost />
					<KnowledgeDropOverlay />
					<Toaster />
				</div>
			</div>
		</TooltipProvider>
	);
}
