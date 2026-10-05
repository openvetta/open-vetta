// @vitest-environment jsdom

import { pluginWorkspaceViewsAtom, type RegisteredActivityTab } from "@shared/store/atoms";
import { render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markPluginHostReady } from "../runtime/plugin-events";
import { PluginActivityTabPanel } from "./PluginActivityTabPanel";
import { PluginWorkspaceViewSurface } from "./PluginWorkspaceViewRoute";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

function BrokenView(): never {
	throw new Error("Test plugin failed to render");
}

function HealthyView(): JSX.Element {
	return <button type="button">Healthy plugin action</button>;
}

describe("plugin view recovery", () => {
	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		markPluginHostReady();
	});

	afterEach(() => vi.restoreAllMocks());

	it("lets the user open a healthy workspace view after another view crashes", async () => {
		const store = createStore();
		store.set(pluginWorkspaceViewsAtom, [
			{
				pluginId: "demo",
				pluginName: "Demo",
				viewId: "broken",
				label: "Broken",
				component: BrokenView,
				navOrder: 1,
				sidebar: true,
			},
			{
				pluginId: "demo",
				pluginName: "Demo",
				viewId: "healthy",
				label: "Healthy",
				component: HealthyView,
				navOrder: 2,
				sidebar: true,
			},
		]);
		const view = (viewId: string) => (
			<Provider store={store}>
				<PluginWorkspaceViewSurface pluginId="demo" viewId={viewId} />
			</Provider>
		);
		const { rerender } = render(view("broken"));
		expect(screen.getByText("workspaceView.failed")).toBeTruthy();

		rerender(view("healthy"));
		await waitFor(() => expect(screen.getByRole("button", { name: "Healthy plugin action" })).toBeTruthy());
		expect(screen.queryByText("workspaceView.failed")).toBeNull();
	});

	it("lets the user switch to a healthy activity tab after a plugin panel crashes", () => {
		const broken: RegisteredActivityTab = {
			pluginId: "demo",
			pluginName: "Demo",
			tabId: "broken",
			label: "Broken",
			component: BrokenView,
		};
		const healthy = { ...broken, tabId: "healthy", component: HealthyView };
		const { rerender } = render(<PluginActivityTabPanel tab={broken} cwd={null} active />);
		expect(screen.getByRole("alert").textContent).toBe("activityTab.failed");

		rerender(<PluginActivityTabPanel tab={healthy} cwd={null} active />);
		expect(screen.getByRole("button", { name: "Healthy plugin action" })).toBeTruthy();
		expect(screen.queryByRole("alert")).toBeNull();
	});
});
