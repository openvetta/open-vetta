// @vitest-environment jsdom

import { ActivityPanelContextProvider } from "@domains/activity-panel/registry/context";
import { useBrowserPanelModel } from "@domains/activity-panel/hooks/useBrowserPanelModel";
import { useRendererMarkdownModel } from "@shared/hooks/useRendererMarkdownModel";
import {
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	browserUrlByWorkspaceAtom,
} from "@shared/store/atoms";
import { createActivityWorkspace } from "@shared/workspace/activity-workspace";
import { formatSshProjectUri } from "@vetta/ssh-transport/project-uri";
import { toastsAtom } from "@shared/store/toast-atoms";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createStore, getDefaultStore, Provider } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RendererMarkdownContent } from "./RendererMarkdownContent";
import { RendererMarkdownScope } from "./RendererMarkdownScope";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

afterEach(cleanup);

const cases = [
	createActivityWorkspace("C:/projects/vetta", "C:/projects/vetta"),
	createActivityWorkspace("agent-team:delivery", "C:/projects/vetta"),
	createActivityWorkspace("conversation:no-project", null),
] as const;

describe("Markdown browser links", () => {
	it.each(cases)("opens an HTTP link in activity workspace $id", (workspace) => {
		const store = createStore();
		function MarkdownLink(): JSX.Element {
			const model = useRendererMarkdownModel(workspace.cwd, true, workspace.id);
			return (
				<RendererMarkdownScope value={model}>
					<RendererMarkdownContent
						text="**访问地址**：[http://localhost:3000](http://localhost:3000)"
					/>
				</RendererMarkdownScope>
			);
		}
		function BrowserTarget(): JSX.Element {
			const model = useBrowserPanelModel();
			return <output data-testid="browser-target">{`${model.workspaceId}:${model.hasPage}`}</output>;
		}

		render(
			<Provider store={store}>
				<ActivityPanelContextProvider value={{ workspace, knowledgeHistory: false }}>
					<MarkdownLink />
					<BrowserTarget />
				</ActivityPanelContextProvider>
			</Provider>,
		);

		fireEvent.click(screen.getByRole("link", { name: "http://localhost:3000" }));

		expect(store.get(browserUrlByWorkspaceAtom).get(workspace.id)).toBe("http://localhost:3000");
		expect(store.get(activityPanelTabByProjectAtom).get(workspace.id)).toBe("browser");
		expect(store.get(activityPanelOpenAtom)).toBe(true);
		expect(screen.getByTestId("browser-target").textContent).toBe(`${workspace.id}:true`);
	});
});

describe("Markdown file links", () => {
	function renderFileLink(cwd: string): void {
		function MarkdownFile(): JSX.Element {
			const model = useRendererMarkdownModel(cwd);
			return (
				<RendererMarkdownScope value={model}>
					<RendererMarkdownContent text="交付物：[showcase.tsx](src/showcase.tsx)" />
				</RendererMarkdownScope>
			);
		}
		render(
			<Provider store={createStore()}>
				<MarkdownFile />
			</Provider>,
		);
	}

	function stubDesktop(stat: { size: number } | null): { revealedPaths: string[] } {
		const revealedPaths: string[] = [];
		vi.stubGlobal("vetta", {
			fs: { stat: async () => (stat ? { ...stat, modifiedAt: 0, createdAt: 0 } : null) },
			shell: {
				showItemInFolder: async (path: string) => {
					revealedPaths.push(path);
				},
			},
		});
		return { revealedPaths };
	}

	afterEach(() => {
		vi.unstubAllGlobals();
		getDefaultStore().set(toastsAtom, []);
	});

	it("reveals the resolved file in the system file manager from the context menu", async () => {
		const { revealedPaths } = stubDesktop({ size: 12 });
		renderFileLink("/Users/me/project");

		fireEvent.contextMenu(screen.getByRole("button", { name: /showcase\.tsx/ }));
		fireEvent.click(await screen.findByRole("menuitem", { name: /markdown\.reveal/ }));

		await waitFor(() => expect(revealedPaths).toEqual(["/Users/me/project/src/showcase.tsx"]));
	});

	it("tells the user when the file no longer exists instead of doing nothing", async () => {
		const { revealedPaths } = stubDesktop(null);
		renderFileLink("/Users/me/project");

		fireEvent.contextMenu(screen.getByRole("button", { name: /showcase\.tsx/ }));
		fireEvent.click(await screen.findByRole("menuitem", { name: /markdown\.reveal/ }));

		await waitFor(() =>
			expect(getDefaultStore().get(toastsAtom).map((toast) => toast.message)).toEqual(["markdown.fileMissing"]),
		);
		expect(revealedPaths).toEqual([]);
	});

	it("offers no reveal menu for files in a remote project", () => {
		stubDesktop({ size: 12 });
		renderFileLink(formatSshProjectUri("host-1", "/srv/app"));

		fireEvent.contextMenu(screen.getByRole("button", { name: /showcase\.tsx/ }));

		expect(screen.queryByRole("menuitem")).toBeNull();
	});
});
