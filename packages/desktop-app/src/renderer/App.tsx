import { useRef, useCallback } from "react";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { Sidebar } from "./domains/project/components/Sidebar";
import { ActivityPanel } from "./domains/activity-panel/components/ActivityPanel";
import { ConfirmDialog } from "./shared/components/ui/confirm-dialog";
import { TitleBar } from "./shared/components/TitleBar";
import { LoginDialog } from "./domains/auth/components/LoginDialog";
import { useProjects } from "./domains/project/hooks/useProjects";
import { useTheme } from "./shared/hooks/useTheme";
import { useAuth } from "./domains/auth/hooks/useAuth";
import { useGlobalShortcuts } from "./shared/hooks/useShortcuts";
import { useAppInit } from "./domains/chat/hooks/useAppInit";
import { useSessionManager } from "./domains/chat/hooks/useSessionManager";

export function RootLayout(): JSX.Element {
	const { openProject, projects } = useProjects();
	const navigate = useNavigate();
	useTheme();
	useAuth();
	useAppInit();
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
		<div className="flex h-screen w-screen flex-col overflow-hidden">
			<TitleBar />
			<div className="flex flex-1 overflow-hidden p-1.5 pl-0">
				<Sidebar onOpenSession={openSession} />
				<main
					className="flex min-w-[320px] flex-1 overflow-hidden rounded-lg bg-[var(--content-bg)]"
					style={{
						border: "var(--panel-border)",
						boxShadow: "var(--panel-shadow)",
					}}
				>
					<Outlet />
				</main>
				<ActivityPanel />
				<ConfirmDialog />
				<LoginDialog />
			</div>
		</div>
	);
}
