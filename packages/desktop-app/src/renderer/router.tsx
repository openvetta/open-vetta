import { createRootRoute, createRoute, createRouter, createHashHistory } from "@tanstack/react-router";
import { lazy } from "react";
import { RouteContentLoadingView } from "@vetta/theme-ui/app";
import { RootLayout } from "./App";
import { RouteErrorPage } from "./shared/components/RouteErrorPage";
import { THEME_PAGE_ROUTE_PATH } from "./shared/theme/pages/themePageRegistry";

const ChatPage = lazy(async () => ({
	default: (await import("./domains/chat/components/ChatPage")).ChatPage,
}));
const NewSessionPage = lazy(async () => ({
	default: (await import("./domains/chat/components/NewSessionPage")).NewSessionPage,
}));
const SessionViewerPage = lazy(async () => ({
	default: (await import("./domains/chat/components/SessionViewerPage")).SessionViewerPage,
}));
const AutomationPage = lazy(async () => ({
	default: (await import("./domains/scheduler/components/AutomationPage")).AutomationPage,
}));
const BatchTasksPage = lazy(async () => ({
	default: (await import("./domains/batch-tasks/components/BatchTasksPage")).BatchTasksPage,
}));
const SkillsPage = lazy(async () => ({
	default: (await import("./domains/skills/components/SkillsPage")).SkillsPage,
}));
const ScenesPage = lazy(async () => ({
	default: (await import("./domains/skills/components/ScenesPage")).ScenesPage,
}));
const PluginsPage = lazy(async () => ({
	default: (await import("./domains/skills/components/PluginsPage")).PluginsPage,
}));
const SettingsPage = lazy(async () => ({
	default: (await import("./domains/settings/components/SettingsPage")).SettingsPage,
}));
const ProjectDetailPage = lazy(async () => ({
	default: (await import("./domains/project/components/ProjectDetailPage")).ProjectDetailPage,
}));
const DownloadsPage = lazy(async () => ({
	default: (await import("./domains/downloads/components/DownloadsPage")).DownloadsPage,
}));
const KnowledgeBasePage = lazy(async () => ({
	default: (await import("./domains/knowledge-base/components/KnowledgeBasePage")).KnowledgeBasePage,
}));
const KnowledgeBaseListPage = lazy(async () => ({
	default: (await import("./domains/knowledge-base/components/KnowledgeBaseListPage")).KnowledgeBaseListPage,
}));
const ThemePageRoute = lazy(async () => ({
	default: (await import("./shared/theme/pages/ThemePageRoute")).ThemePageRoute,
}));

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
	validateSearch: (search: Record<string, unknown>) => {
		// skill / connector 为历史深链，页面内统一映射到 capability；plugin / scene 会重定向。
		const tab =
			search.tab === "scene" ||
			search.tab === "capability" ||
			search.tab === "skill" ||
			search.tab === "plugin" ||
			search.tab === "connector"
				? search.tab
				: undefined;
		const section = typeof search.section === "string" ? search.section : undefined;
		const nav = typeof search.nav === "string" ? search.nav : undefined;
		return {
			...(tab ? { tab } : {}),
			...(section ? { section } : {}),
			...(nav ? { nav } : {}),
		};
	},
});

const scenesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/scenes",
	component: ScenesPage,
});

const pluginsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/plugins",
	component: PluginsPage,
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

const themePageRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: THEME_PAGE_ROUTE_PATH,
	component: ThemePageRoute,
});

const routeTree = rootRoute.addChildren([
	indexRoute,
	automationRoute,
	batchTasksRoute,
	knowledgeRoute,
	knowledgeListRoute,
	skillsRoute,
	scenesRoute,
	pluginsRoute,
	settingsTabRoute,
	projectDetailRoute,
	downloadsRoute,
	newSessionRoute,
	sessionViewerRoute,
	themePageRoute,
]);

export const router = createRouter({
	routeTree,
	history: createHashHistory(),
	defaultNotFoundComponent: ChatPage,
	defaultErrorComponent: RouteErrorPage,
	defaultPendingComponent: RouteContentLoadingView,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
