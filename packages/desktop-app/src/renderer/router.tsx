import { createRootRoute, createRoute, createRouter, createHashHistory } from "@tanstack/react-router";
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
import { KnowledgeBasePage } from "./domains/knowledge-base/components/KnowledgeBasePage";
import { KnowledgeBaseListPage } from "./domains/knowledge-base/components/KnowledgeBaseListPage";
import { KnowledgeRecordsPage } from "./domains/knowledge/components/KnowledgeRecordsPage";
import { RouteErrorPage } from "./shared/components/RouteErrorPage";

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

const knowledgeRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/knowledge",
	component: KnowledgeBasePage,
});

const knowledgeListRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/knowledge/all",
	component: KnowledgeBaseListPage,
});

const settingsTabRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/settings/$tab",
	component: SettingsPage,
	validateSearch: (search: Record<string, unknown>) => {
		const section = typeof search.section === "string" ? search.section : undefined;
		const h2 = typeof search.h2 === "string" ? search.h2 : undefined;
		const nav = typeof search.nav === "string" ? search.nav : undefined;
		return {
			...(section ? { section } : {}),
			...(h2 ? { h2 } : {}),
			...(nav ? { nav } : {}),
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

const knowledgeRecordsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/knowledge-records",
	component: KnowledgeRecordsPage,
});

const routeTree = rootRoute.addChildren([
	indexRoute,
	automationRoute,
	batchTasksRoute,
	knowledgeRoute,
	knowledgeListRoute,
	skillsRoute,
	settingsTabRoute,
	projectDetailRoute,
	downloadsRoute,
	newSessionRoute,
	sessionViewerRoute,
	knowledgeRecordsRoute,
]);

export const router = createRouter({
	routeTree,
	history: createHashHistory(),
	defaultNotFoundComponent: ChatPage,
	defaultErrorComponent: RouteErrorPage,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
