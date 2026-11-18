// @vitest-environment jsdom
import { resolvedThemeAtom } from "@shared/store/atoms";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { MutableRefObject, PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityPanelContextProvider } from "../registry/context";
import { useBrowserPanelModel } from "./useBrowserPanelModel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

interface FakeGuest {
	insertCSS: (css: string) => Promise<string>;
	removeInsertedCSS: (key: string) => Promise<void>;
}

/** renderHook 不会把 props 传给 wrapper，切工作空间靠这个可变值 + rerender 驱动。 */
let currentWorkspaceId = "/work/project";

function setup() {
	const store = createStore();
	currentWorkspaceId = "/work/project";
	function Wrapper({ children }: PropsWithChildren) {
		return (
			<Provider store={store}>
				<ActivityPanelContextProvider
					value={{
						workspace: { id: currentWorkspaceId, cwd: currentWorkspaceId, runtimeIds: [] },
						knowledgeHistory: false,
					}}
				>
					{children}
				</ActivityPanelContextProvider>
			</Provider>
		);
	}
	const hook = renderHook(useBrowserPanelModel, { wrapper: Wrapper });
	const switchWorkspace = (workspaceId: string): void => {
		currentWorkspaceId = workspaceId;
		hook.rerender();
	};
	return { store, switchWorkspace, ...hook };
}

function fakeGuest(key: string): FakeGuest & HTMLElement {
	return {
		insertCSS: vi.fn(async () => key),
		removeInsertedCSS: vi.fn(async () => undefined),
	} as unknown as FakeGuest & HTMLElement;
}

function attachGuest(model: { webviewRef: unknown }, guest: HTMLElement): void {
	(model.webviewRef as MutableRefObject<HTMLElement | null>).current = guest;
}

async function flushInjection(): Promise<void> {
	await act(async () => {
		await Promise.resolve();
	});
}

afterEach(cleanup);

describe("browser panel theme injection", () => {
	// guest 是独立文档，宿主的 color-scheme 传不进去；不注入就会在深色主题下出现浅色滚动条。
	it("injects the resolved theme into the guest and replaces the previous stylesheet", async () => {
		const { store, result } = setup();
		const guest = fakeGuest("key-light");
		attachGuest(result.current, guest);

		act(() => store.set(resolvedThemeAtom, "light"));
		await flushInjection();
		expect(guest.insertCSS).toHaveBeenCalledWith(":root { color-scheme: light; }");

		act(() => store.set(resolvedThemeAtom, "dark"));
		await flushInjection();
		expect(guest.insertCSS).toHaveBeenLastCalledWith(":root { color-scheme: dark; }");
		expect(guest.removeInsertedCSS).toHaveBeenCalledWith("key-light");
	});

	// 重新导航会拿到新文档，此前注入的样式随旧文档失效，必须重新注入。
	it("re-injects on every dom-ready of the guest", async () => {
		const { store, result, switchWorkspace } = setup();
		act(() => store.set(resolvedThemeAtom, "dark"));
		const listeners = new Map<string, () => void>();
		const guest = {
			...fakeGuest("key-dark"),
			addEventListener: (type: string, handler: () => void) => listeners.set(type, handler),
			removeEventListener: (type: string) => listeners.delete(type),
		} as unknown as FakeGuest & HTMLElement;
		attachGuest(result.current, guest);
		// webview 在挂载时还不存在，切工作空间让绑定 effect 重跑并挂到当前 guest 上。
		act(() => switchWorkspace("/work/other"));
		listeners.clear();
		act(() => switchWorkspace("/work/third"));

		act(() => listeners.get("dom-ready")?.());
		await flushInjection();
		expect(guest.insertCSS).toHaveBeenCalledWith(":root { color-scheme: dark; }");
	});
});
