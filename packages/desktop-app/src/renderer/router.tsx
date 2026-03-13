import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { App } from "./App";

const rootRoute = createRootRoute({
	component: () => <App />,
});

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: () => null,
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
