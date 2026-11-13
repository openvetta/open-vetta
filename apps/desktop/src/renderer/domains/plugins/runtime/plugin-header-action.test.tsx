// @vitest-environment jsdom
import type { InstalledPlugin } from "@preload/api";
import { pluginHeaderActionsAtom } from "@shared/store/plugin-atoms";
import type { PluginPermission } from "@vetta-org/plugin-sdk";
import { Provider, createStore } from "jotai";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PluginHeaderActions } from "../components/PluginHeaderActions";
import { PluginLocalContributions } from "./plugin-local-contributions";
import { createPluginUiApi } from "./plugin-ui-context";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../runtime/plugin-i18n", () => ({
	PluginInlineI18nBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	usePluginTextResolver: () => (_id: string, text: string) => text,
}));

afterEach(() => {
	document.body.replaceChildren();
});

function createUi(permissions: PluginPermission[]) {
	const contributions = new PluginLocalContributions();
	const plugin = {
		id: "demo-plugin",
		name: "Demo",
		permissions,
		grantedPermissions: permissions,
	} as unknown as InstalledPlugin;
	const ui = createPluginUiApi({
		plugin,
		contributions,
		onChanged: () => {},
		disposers: [],
		agentContributions: { handlers: [] } as never,
		capabilitySessionId: "session-1",
	});
	return { contributions, ui };
}

describe("registerHeaderAction", () => {
	it("registers with the permission and removes on dispose", () => {
		const { contributions, ui } = createUi(["ui.slot.header-action"]);
		const disposable = ui.registerHeaderAction({ id: "open", order: 10, component: () => null });
		expect(contributions.headerActions).toHaveLength(1);
		disposable.dispose();
		expect(contributions.headerActions).toHaveLength(0);
	});

	it("is a no-op without the permission", () => {
		const { contributions, ui } = createUi([]);
		ui.registerHeaderAction({ id: "open", component: () => null });
		expect(contributions.headerActions).toHaveLength(0);
	});

	it("rejects an empty id and a non-finite order", () => {
		const { ui } = createUi(["ui.slot.header-action"]);
		expect(() => ui.registerHeaderAction({ id: " ", component: () => null })).toThrow();
		expect(() => ui.registerHeaderAction({ id: "x", order: Number.NaN, component: () => null })).toThrow();
	});
});

describe("PluginHeaderActions", () => {
	async function render(actions: unknown[]) {
		const store = createStore();
		store.set(pluginHeaderActionsAtom, actions as never);
		const app = document.createElement("div");
		document.body.append(app);
		await act(async () => {
			createRoot(app).render(
				<Provider store={store}>
					<PluginHeaderActions />
				</Provider>,
			);
		});
		return app;
	}

	it("renders nothing when no plugin contributes", async () => {
		const app = await render([]);
		expect(app.querySelector("[data-plugin-header-actions]")).toBeNull();
	});

	it("wraps every contribution in a host container and keeps the given order", async () => {
		const app = await render([
			{ pluginId: "a", pluginName: "A", actionId: "a:one", component: () => <button type="button">one</button> },
			{ pluginId: "b", pluginName: "B", actionId: "b:two", component: () => <button type="button">two</button> },
		]);
		const items = [...app.querySelectorAll("[data-plugin-header-action]")];
		expect(items.map((item) => item.getAttribute("data-plugin-header-action"))).toEqual(["a:one", "b:two"]);
		expect(items.map((item) => item.textContent)).toEqual(["one", "two"]);
		// 宿主固定间距：整排 gap-2，每项容器空时收起。
		expect(app.querySelector("[data-plugin-header-actions]")?.className).toContain("gap-2");
		expect(items[0]?.className).toContain("empty:hidden");
	});

	it("a throwing contribution disappears without taking the others down", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const Boom = () => {
			throw new Error("boom");
		};
		const app = await render([
			{ pluginId: "a", pluginName: "A", actionId: "a:boom", component: Boom },
			{ pluginId: "b", pluginName: "B", actionId: "b:ok", component: () => <button type="button">ok</button> },
		]);
		expect(app.textContent).toBe("ok");
		error.mockRestore();
	});
});
