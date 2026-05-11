import { useRef, useCallback, useEffect } from "react";
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
import { useAppInit } from "./domains/chat/hooks/useAppInit";
import { useSessionManager } from "./domains/chat/hooks/useSessionManager";
import { useFlowingInit } from "./domains/flowing/hooks/useFlowingInit";
import { useFlowingChatInit } from "./domains/flowing-chat/hooks/useFlowingChatInit";
import { useDownloadsInit } from "./domains/downloads/hooks/useDownloadsInit";
import { FilePreviewDialog } from "./domains/file-preview/components/FilePreviewDialog";
import { UpdateRestartDialog } from "./shared/components/UpdateRestartDialog";
import { TooltipProvider } from "./shared/components/ui/tooltip";
import {
	sandboxPermissionDrawerAtom,
	sidebarCollapsedAtom,
	pageHeaderTitleAtom,
	pageHeaderRightSlotAtom,
} from "./shared/store/atoms";
import { isMac } from "./shared/lib/platform";
import { cn } from "./shared/lib/utils";

const ROUTE_TITLES: Array<{ match: RegExp; title: string }> = [
	{ match: /^\/automation$/, title: "自动化" },
	{ match: /^\/batch-tasks$/, title: "批量任务" },
	{ match: /^\/skills$/, title: "技能广场" },
	{ match: /^\/settings\b/, title: "设置" },
	{ match: /^\/project\b/, title: "项目详情" },
	{ match: /^\/downloads$/, title: "下载中心" },
	{ match: /^\/$/, title: "对话" },
];

function PageHeader({
	sidebarCollapsed,
	onExpandSidebar,
}: {
	sidebarCollapsed: boolean;
	onExpandSidebar: () => void;
}): JSX.Element {
	const matches = useMatches();
	const path = matches[matches.length - 1]?.pathname ?? "/";
	const titleOverride = useAtomValue(pageHeaderTitleAtom);
	const rightSlot = useAtomValue(pageHeaderRightSlotAtom);
	const fallbackTitle = ROUTE_TITLES.find((r) => r.match.test(path))?.title ?? "Vetta";
	const title = titleOverride && titleOverride.length > 0 ? titleOverride : fallbackTitle;

	return (
		<div
			className={cn("drag-region relative flex h-11 shrink-0 items-center justify-between gap-2",
				!isMac && "h-8"
			)}
			style={{
				paddingLeft: isMac && sidebarCollapsed ? 78 : 12,
				paddingRight: isMac ? 12 : 0,
				marginBottom: isMac ? 0 : 10
			}}
		>
			<div className="no-drag flex min-w-0 items-center gap-2">
				<AnimatePresence initial={false}>
					{sidebarCollapsed && (
						<motion.button
							key="expand"
							type="button"
							onClick={onExpandSidebar}
							initial={{ opacity: 0, scale: 0.85, width: 0 }}
							animate={{ opacity: 1, scale: 1, width: 28 }}
							exit={{ opacity: 0, scale: 0.85, width: 0 }}
							transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
							title="展开侧边栏"
							className="flex h-7 shrink-0 items-center justify-center overflow-hidden rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							<span className="icon-[mdi--dock-left] h-4 w-4" />
						</motion.button>
					)}
				</AnimatePresence>
				<motion.h1
					key={title}
					initial={{ opacity: 0, y: 2 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.18 }}
					className="min-w-0 truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground"
				>
					{title}
				</motion.h1>
			</div>
			<div className="no-drag flex shrink-0 items-center gap-1">
				{rightSlot}
				{!isMac && <WindowControls />}
			</div>
		</div>
	);
}

export function RootLayout(): JSX.Element {
	const { openProject, projects } = useProjects();
	const navigate = useNavigate();
	const setSandboxPermissionDrawer = useSetAtom(sandboxPermissionDrawerAtom);
	const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
	const toggleSidebar = useCallback(() => {
		setSidebarCollapsed((v) => !v);
	}, [setSidebarCollapsed]);
	useTheme();
	useAuth();
	useAppInit();
	useFlowingInit();
	useFlowingChatInit();
	useDownloadsInit();
	useUpdaterInit();
	const { openSession, openSessionRef } = useSessionManager();
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

	// ─── Global keyboard shortcuts ───
	const projectsRef = useRef(projects);
	projectsRef.current = projects;

	useGlobalShortcuts(
		useCallback(
			(actionId: string) => {
				switch (actionId) {
					case "new-session": {
						const firstProject = projectsRef.current[0];
						if (firstProject) {
							void openSessionRef.current?.(firstProject.cwd);
						}
						break;
					}
					case "open-project": {
						void openProject();
						break;
					}
					case "open-settings": {
						void navigate({ to: "/settings/$tab", params: { tab: "general" } });
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
				<div className="flex flex-1 gap-2 overflow-hidden p-2">
					<AnimatePresence initial={false}>
						{!sidebarCollapsed && (
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
					<main className="relative flex min-w-[320px] flex-1 flex-col overflow-hidden bg-transparent">
						<PageHeader
							sidebarCollapsed={sidebarCollapsed}
							onExpandSidebar={toggleSidebar}
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
				</div>
			</div>
		</TooltipProvider>
	);
}
