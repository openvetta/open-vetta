// @vitest-environment jsdom
import { browserUrlByWorkspaceAtom } from "@shared/store/atoms";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { Suspense, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityTabActivationContextProvider } from "../registry/activation-context";
import { ActivityPanelContextProvider } from "../registry/context";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../components/BrowserPanel", () => ({
	BrowserPanel: () => <div data-testid="browser-panel" />,
}));

const { browserTabDefinition } = await import("./browser-tab.js");
const BrowserTab = browserTabDefinition.component;
const store = getDefaultStore();
const workspaceId = "workspace";

function wrapperFor({ active = false }: { active?: boolean } = {}) {
	return ({ children }: { children: ReactNode }) => (
		<ActivityPanelContextProvider
			value={{ workspace: { id: workspaceId, cwd: "/work/project", runtimeIds: [] }, knowledgeHistory: false }}
		>
			<ActivityTabActivationContextProvider value={active}>{children}</ActivityTabActivationContextProvider>
		</ActivityPanelContextProvider>
	);
}

async function flushLazyImport(): Promise<void> {
	await act(async () => {
		await Promise.resolve();
	});
}

describe("activity panel browser tab", () => {
	beforeEach(() => store.set(browserUrlByWorkspaceAtom, new Map()));
	afterEach(cleanup);

	// 常驻页签：没有地址也必须上栏，用户才能手动打开浏览器。以前靠 URL 决定存在，
	// 一旦隐藏或重启就再也加不回来。
	it("stays on the bar without any address", () => {
		const meta = renderHook(() => browserTabDefinition.useMeta(), { wrapper: wrapperFor() });
		expect(meta.result.current).toMatchObject({ label: "browser.tab" });
	});

	// 页签常驻不等于立刻创建 Electron guest：只有激活过或有地址时才挂载面板。
	it("mounts the panel only once activated or given an address", async () => {
		render(
			<Suspense fallback={null}>
				<BrowserTab />
			</Suspense>,
			{ wrapper: wrapperFor() },
		);
		await flushLazyImport();
		expect(screen.queryByTestId("browser-panel")).toBeNull();
		cleanup();

		render(
			<Suspense fallback={null}>
				<BrowserTab />
			</Suspense>,
			{ wrapper: wrapperFor({ active: true }) },
		);
		expect(await screen.findByTestId("browser-panel")).toBeTruthy();
		cleanup();

		store.set(browserUrlByWorkspaceAtom, new Map([[workspaceId, "https://example.com/docs"]]));
		render(
			<Suspense fallback={null}>
				<BrowserTab />
			</Suspense>,
			{ wrapper: wrapperFor() },
		);
		expect(await screen.findByTestId("browser-panel")).toBeTruthy();
	});
});
