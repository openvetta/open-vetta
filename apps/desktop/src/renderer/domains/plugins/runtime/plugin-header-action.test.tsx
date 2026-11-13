// @vitest-environment jsdom
import type { InstalledPlugin } from "@preload/api";
import { pluginHeaderActionsAtom } from "@shared/store/plugin-atoms";
import type { PluginPermission } from "@vetta-org/plugin-sdk";
import { Provider, createStore } from "jotai";
import { act, useContext } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationHeaderActions } from "@domains/header-actions/ConversationHeaderActions";
import { headerActionLayoutAtom } from "@domains/header-actions/layout-store";
import { PluginLocalContributions } from "./plugin-local-contributions";
import { createPluginUiApi } from "./plugin-ui-context";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// 真实的 i18n 作用域每次渲染都会换一个 context 值：探针因此会跟着父级重渲染，
// 这正是「发布 → 父级更新 → 探针重渲染 → 再发布」死循环的来源，所以 mock 也要这样做。
const { UnstableContext } = vi.hoisted(() => ({ UnstableContext: { current: null as null | React.Context<object> } }));

vi.mock("../runtime/plugin-i18n", async () => {
	const { createContext } = await import("react");
	UnstableContext.current = createContext<object>({});
	return {
		PluginInlineI18nBoundary: ({ children }: { children: React.ReactNode }) => {
			const Context = UnstableContext.current as React.Context<object>;
			return <Context.Provider value={{}}>{children}</Context.Provider>;
		},
		usePluginTextResolver: () => (_id: string, text: string) => text,
	};
});

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
		const disposable = ui.registerHeaderAction({ id: "open", order: 10, useAction: () => null });
		expect(contributions.headerActions).toHaveLength(1);
		disposable.dispose();
		expect(contributions.headerActions).toHaveLength(0);
	});

	it("is a no-op without the permission", () => {
		const { contributions, ui } = createUi([]);
		ui.registerHeaderAction({ id: "open", useAction: () => null });
		expect(contributions.headerActions).toHaveLength(0);
	});

	it("rejects an empty id, a non-finite order, a missing hook and a duplicate id", () => {
		const { ui } = createUi(["ui.slot.header-action"]);
		expect(() => ui.registerHeaderAction({ id: " ", useAction: () => null })).toThrow();
		expect(() => ui.registerHeaderAction({ id: "x", order: Number.NaN, useAction: () => null })).toThrow();
		expect(() => ui.registerHeaderAction({ id: "y", useAction: undefined as never })).toThrow();
		ui.registerHeaderAction({ id: "dup", useAction: () => null });
		expect(() => ui.registerHeaderAction({ id: "dup", useAction: () => null })).toThrow();
	});
});

describe("ConversationHeaderActions", () => {
	const builtin = (name: string) => ({
		key: `builtin:${name}`,
		title: name,
		icon: <span />,
		behavior: { type: "click" as const, onClick: () => {} },
	});

	async function render(actions: unknown[], builtins = [builtin("export"), builtin("pin")], saved: unknown = null) {
		const store = createStore();
		store.set(pluginHeaderActionsAtom, actions as never);
		store.set(headerActionLayoutAtom, saved as never);
		const app = document.createElement("div");
		document.body.append(app);
		await act(async () => {
			createRoot(app).render(
				<Provider store={store}>
					<ConversationHeaderActions builtins={builtins} pinned={<button type="button" data-testid="pinned" />} />
				</Provider>,
			);
		});
		return { app, store };
	}

	const titles = (app: HTMLElement) =>
		[...app.querySelectorAll("[data-slot=button-group] button[title]")].map((button) => button.getAttribute("title"));

	const action = (id: string, useAction: () => unknown) => ({
		pluginId: "p",
		pluginName: "P",
		actionId: `p:${id}`,
		useAction,
	});

	it("does not loop when the plugin hook re-renders with its parent's context", async () => {
		const consume = () => {
			// 与真实插件里的 useTranslation() 一样吃 i18n 作用域的 context。
			useContext(UnstableContext.current as React.Context<object>);
			return { title: "ctx", icon: <i />, onClick: () => {} };
		};
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const { app } = await render([action("ctx", consume)]);
		expect(error).not.toHaveBeenCalled();
		expect(titles(app)).toEqual(["ctx", "export", "pin"]);
		error.mockRestore();
	});

	it("puts plugin actions ahead of the built-ins and keeps the pinned item last", async () => {
		const { app } = await render([action("one", () => ({ title: "one", icon: <i />, onClick: () => {} }))]);
		expect(titles(app)).toEqual(["one", "export", "pin"]);
		const buttons = [...app.querySelectorAll("[data-slot=button-group] > *")];
		expect(buttons.at(-1)?.getAttribute("data-testid")).toBe("pinned");
	});

	it("an action whose hook returns null takes no slot", async () => {
		const { app } = await render([action("hidden", () => null)]);
		expect(titles(app)).toEqual(["export", "pin"]);
	});

	it("an invalid declaration is dropped and warned about, not rendered", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { app } = await render([action("bad", () => ({ title: "bad", icon: <i /> }))]);
		expect(titles(app)).toEqual(["export", "pin"]);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("p:bad"));
		warn.mockRestore();
	});

	it("a throwing hook disappears without taking the others down", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const { app } = await render([
			action("boom", () => {
				throw new Error("boom");
			}),
			action("ok", () => ({ title: "ok", icon: <i />, onClick: () => {} })),
		]);
		expect(titles(app)).toEqual(["ok", "export", "pin"]);
		error.mockRestore();
	});

	it("keeps at most seven in the header and stows the rest, built-ins counted", async () => {
		const many = Array.from({ length: 6 }, (_, index) =>
			action(`a${index}`, () => ({ title: `a${index}`, icon: <i />, onClick: () => {} })),
		);
		const { app } = await render(many);
		// 6 个插件 + 2 个内置 = 8，只显示 7；最后一个内置（pin）被收纳。
		expect(titles(app).filter((title) => title !== "customize")).toHaveLength(7);
		expect(titles(app)).not.toContain("pin");
	});

	it("honours the saved layout over the default order", async () => {
		const { app } = await render(
			[action("one", () => ({ title: "one", icon: <i />, onClick: () => {} }))],
			[builtin("export"), builtin("pin")],
			{ top: ["builtin:pin", "builtin:export"], tray: ["p:one"] },
		);
		expect(titles(app)).toEqual(["pin", "export"]);
	});
});
