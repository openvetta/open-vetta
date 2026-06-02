import { createRootRoute, createRoute, createRouter, createHashHistory, type ErrorComponentProps } from "@tanstack/react-router";
import { RootLayout } from "./App";
import { ChatPage } from "./domains/chat/components/ChatPage";
import { NewSessionPage } from "./domains/chat/components/NewSessionPage";
import { SessionViewerPage } from "./domains/chat/components/SessionViewerPage";
import { AutomationPage } from "./domains/scheduler/components/AutomationPage";
import { BatchTasksPage } from "./domains/batch-tasks/components/BatchTasksPage";
import { SkillsPage } from "./domains/skills/components/SkillsPage";
import { SettingsPage } from "./domains/settings/components/SettingsPage";
import { ProjectDetailPage } from "./domains/project/components/ProjectDetailPage";
import { DownloadsPage } from "./domains/downloads/components/DownloadsPage";

const rootRoute = createRootRoute({
	component: RootLayout,
});

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: ChatPage,
});

const automationRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/automation",
	component: AutomationPage,
});

const batchTasksRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/batch-tasks",
	component: BatchTasksPage,
});

const skillsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/skills",
	component: SkillsPage,
});

const settingsTabRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/settings/$tab",
	component: SettingsPage,
	validateSearch: (search: Record<string, unknown>) => {
		const section = typeof search.section === "string" ? search.section : undefined;
		const h2 = typeof search.h2 === "string" ? search.h2 : undefined;
		return {
			...(section ? { section } : {}),
			...(h2 ? { h2 } : {}),
		};
	},
});

const projectDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/project/$cwd",
	component: ProjectDetailPage,
});

const downloadsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/downloads",
	component: DownloadsPage,
});

const newSessionRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/new-session/$cwd",
	component: NewSessionPage,
});

const sessionViewerRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/viewer/$path",
	component: SessionViewerPage,
});

const routeTree = rootRoute.addChildren([
	indexRoute,
	automationRoute,
	batchTasksRoute,
	skillsRoute,
	settingsTabRoute,
	projectDetailRoute,
	downloadsRoute,
	newSessionRoute,
	sessionViewerRoute,
]);

function DefaultRouteErrorComponent({ error, reset }: ErrorComponentProps): JSX.Element {
	const message = error instanceof Error ? error.message : String(error);
	if (typeof console !== "undefined") {
		console.error("[router error]", error);
	}
	return (
		<div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-muted-foreground/70">
			<span className="icon-[mdi--alert-circle-outline] text-[40px]" />
			<div className="text-center">
				<p className="text-[14px] font-medium text-foreground">页面出错了</p>
				<p className="mt-1 max-w-md break-all text-[12px] text-muted-foreground/60">{message}</p>
			</div>
			<button
				type="button"
				onClick={reset}
				className="rounded-full bg-primary px-4 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90"
			>
				重试
			</button>
		</div>
	);
}

export const router = createRouter({
	routeTree,
	history: createHashHistory(),
	defaultNotFoundComponent: ChatPage,
	defaultErrorComponent: DefaultRouteErrorComponent,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
