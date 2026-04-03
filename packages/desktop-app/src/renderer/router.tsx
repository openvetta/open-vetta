import { createRootRoute, createRoute, createRouter, createHashHistory } from "@tanstack/react-router";
import { RootLayout } from "./App";
import { ChatPage } from "./domains/chat/components/ChatPage";
import { AutomationPage } from "./domains/scheduler/components/AutomationPage";
import { BatchTasksPage } from "./domains/batch-tasks/components/BatchTasksPage";
import { SkillsPage } from "./domains/skills/components/SkillsPage";
import { SettingsPage } from "./domains/settings/components/SettingsPage";
import { ProjectDetailPage } from "./domains/project/components/ProjectDetailPage";

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
});

const projectDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/project/$cwd",
	component: ProjectDetailPage,
});

const routeTree = rootRoute.addChildren([
	indexRoute,
	automationRoute,
	batchTasksRoute,
	skillsRoute,
	settingsTabRoute,
	projectDetailRoute,
]);

export const router = createRouter({
	routeTree,
	history: createHashHistory(),
	defaultNotFoundComponent: ChatPage,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
