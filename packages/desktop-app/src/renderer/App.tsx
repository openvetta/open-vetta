import { useRef, useCallback, useEffect } from "react";
import { useSetAtom } from "jotai";
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
import { sandboxPermissionDrawerAtom } from "./shared/store/atoms";

export function RootLayout(): JSX.Element {
	const { openProject, projects } = useProjects();
	const navigate = useNavigate();
	const setSandboxPermissionDrawer = useSetAtom(sandboxPermissionDrawerAtom);
	useTheme();
	useAuth();
	useAppInit();
	useFlowingInit();
	useFlowingChatInit();
	useDownloadsInit();
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
