import { useRef, useCallback } from "react";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { Sidebar } from "./domains/project/components/Sidebar";
import { ConfirmDialog } from "./shared/components/ui/confirm-dialog";
import { TitleBar } from "./shared/components/TitleBar";
import { LoginDialog } from "./domains/auth/components/LoginDialog";
import { FlowingSendDialog } from "./domains/flowing/components/FlowingSendDialog";
import { WorkflowCompleteDialog } from "./domains/flowing/components/WorkflowCompleteDialog";
import { useProjects } from "./domains/project/hooks/useProjects";
import { useTheme } from "./shared/hooks/useTheme";
import { useAuth } from "./domains/auth/hooks/useAuth";
import { useGlobalShortcuts } from "./shared/hooks/useShortcuts";
import { useAppInit } from "./domains/chat/hooks/useAppInit";
import { useSessionManager } from "./domains/chat/hooks/useSessionManager";
import { useFlowingInit } from "./domains/flowing/hooks/useFlowingInit";
import { useFlowingChatInit } from "./domains/flowing-chat/hooks/useFlowingChatInit";
import { useDownloadsInit } from "./domains/downloads/hooks/useDownloadsInit";
import { FilePreviewDialog } from "./domains/file-preview/components/FilePreviewDialog";
import { TooltipProvider } from "./shared/components/ui/tooltip";

export function RootLayout(): JSX.Element {
	const { openProject, projects } = useProjects();
	const navigate = useNavigate();
	useTheme();
	useAuth();
	useAppInit();
	useFlowingInit();
	useFlowingChatInit();
	useDownloadsInit();
	const { openSession, openSessionRef } = useSessionManager();

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
			<div className="flex h-screen w-screen flex-col overflow-hidden">
				<TitleBar />
				<div className="flex flex-1 overflow-hidden p-1.5 pl-0">
					<Sidebar onOpenSession={openSession} />
					<main
						className="flex min-w-[320px] flex-1 overflow-hidden rounded-lg border border-border bg-background shadow-lg"
					>
						<Outlet />
					</main>
					<ConfirmDialog />
					<LoginDialog />
					<FlowingSendDialog />
					<WorkflowCompleteDialog />
					<FilePreviewDialog />
				</div>
			</div>
		</TooltipProvider>
	);
}
