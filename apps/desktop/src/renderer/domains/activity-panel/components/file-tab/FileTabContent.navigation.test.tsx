// @vitest-environment jsdom

import { useRendererMarkdownModel } from "@shared/hooks/useRendererMarkdownModel";
import {
	ACTIVITY_PANEL_WIDTH_STORAGE_KEY,
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	activityPanelWidthAtom,
	activityPanelWidthModeAtom,
	expandedDirsAtom,
	type FsEntry,
	filePreviewAtom,
	inlineFilePreviewAtom,
	setActivityPanelWidthAtom,
	syncActivityPanelPreviewAvailabilityAtom,
} from "@shared/store/atoms";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarkdownContent } from "@vetta-org/theme-ui/markdown";
import { createInstance } from "i18next";
import { createStore, Provider, useAtomValue } from "jotai";
import { I18nextProvider } from "react-i18next";
import { VirtuosoMockContext } from "react-virtuoso";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import enChat from "@/shared/i18n/locales/en/chat.json";
import enCommon from "@/shared/i18n/locales/en/common.json";
import { FileTabContent } from "./FileTabContent";

const cwd = "/project";
const workspaceId = "team-workspace";
const filePath = "/project/docs/nested.md";
const i18n = createInstance();
void i18n.init({
	lng: "en",
	resources: { en: { chat: enChat, common: enCommon } },
	initAsync: false,
	interpolation: { escapeValue: false },
});

function entry(path: string, isDirectory = false): FsEntry {
	return { name: path.split("/").at(-1) ?? path, path, isDirectory, size: 12, modifiedAt: 1 };
}

const directories = new Map([
	[cwd, [entry("/project/docs", true), entry("/project/readme.md")]],
	["/project/docs", [entry(filePath), entry("/project/docs/second.md")]],
]);
const readDir = vi.fn(async (path: string) => directories.get(path) ?? []);
const readEditableTextFile = vi.fn(async (path: string) => ({
	content: `# Contents of ${path}`,
	revision: "revision-1",
	hasBom: false,
	lineEnding: "lf" as const,
	size: 12,
	modifiedAt: 1,
}));

function setWindowWidth(width: number): void {
	Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
}

interface HarnessProps {
	root?: string | null;
	path?: string;
	preferInline?: boolean;
}

function Harness({ root = cwd, path = filePath, preferInline = true }: HarnessProps): JSX.Element {
	const model = useRendererMarkdownModel(root, preferInline, workspaceId);
	const open = useAtomValue(activityPanelOpenAtom);
	const tabs = useAtomValue(activityPanelTabByProjectAtom);
	return (
		<>
			<MarkdownContent {...model} text={`[Open context file](${path})`} />
			{open && tabs.get(workspaceId) === "file" && <FileTabContent cwd={root} />}
		</>
	);
}

function renderWorkspace({
	width = 360,
	open = false,
	...props
}: HarnessProps & { width?: number | "max"; open?: boolean } = {}) {
	const store = createStore();
	store.set(setActivityPanelWidthAtom, width);
	store.set(activityPanelOpenAtom, open);
	store.set(activityPanelTabByProjectAtom, new Map([[workspaceId, "file"]]));
	const rendered = render(
		<Provider store={store}>
			<I18nextProvider i18n={i18n}>
				<VirtuosoMockContext.Provider value={{ viewportHeight: 600, itemHeight: 28 }}>
					<Harness {...props} />
				</VirtuosoMockContext.Provider>
			</I18nextProvider>
		</Provider>,
	);
	return { store, ...rendered };
}

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	setWindowWidth(1400);
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: {
			fs: {
				readDir,
				readEditableTextFile,
				watchDir: vi.fn(async () => {}),
				unwatchDir: vi.fn(async () => {}),
				onDirChanged: vi.fn(() => () => {}),
				cacheDragIcon: vi.fn(),
			},
		},
	});
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
	Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
	Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
	const getComputedStyle = window.getComputedStyle.bind(window);
	vi.spyOn(window, "getComputedStyle").mockImplementation((element) => getComputedStyle(element));
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	Reflect.deleteProperty(Range.prototype, "getClientRects");
	Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
});

describe("context file preview width and navigation", () => {
	it.each([false, true])(
		"opens a context file in the default width (panel already open: %s), switches to its tree and back, then closes",
		async (open) => {
			const user = userEvent.setup();
			const { store } = renderWorkspace({ open });
			await user.click(screen.getByRole("button", { name: "Open context file" }));
			expect(store.get(activityPanelOpenAtom)).toBe(true);
			expect(store.get(activityPanelTabByProjectAtom).get(workspaceId)).toBe("file");
			expect(await screen.findByRole("heading", { name: "nested.md" })).toBeTruthy();
			expect(await screen.findByText(`Contents of ${filePath}`)).toBeTruthy();
			expect(store.get(activityPanelWidthAtom)).toBe(360);
			expect(localStorage.getItem(ACTIVITY_PANEL_WIDTH_STORAGE_KEY)).toBe("360");
			expect(screen.queryByRole("tree")).toBeNull();

			await user.click(screen.getByRole("button", { name: "Project files" }));
			expect(await screen.findByRole("treeitem", { name: "nested.md" })).toBeTruthy();
			await waitFor(() =>
				expect(screen.getByRole("treeitem", { name: "nested.md" }).getAttribute("aria-selected")).toBe("true"),
			);
			expect(store.get(expandedDirsAtom).has("/project/docs")).toBe(true);
			expect(screen.queryByRole("heading", { name: "nested.md" })).toBeNull();
			await user.click(screen.getByRole("button", { name: "Preview", pressed: false }));
			expect(await screen.findByRole("heading", { name: "nested.md" })).toBeTruthy();
			expect(store.get(activityPanelWidthAtom)).toBe(360);
			await user.click(screen.getByRole("button", { name: "Close" }));
			expect(await screen.findByRole("tree")).toBeTruthy();
			expect(store.get(inlineFilePreviewAtom)).toBeNull();
			expect(store.get(activityPanelWidthAtom)).toBe(360);
		},
	);

	it.each([720, "max"] as const)(
		"preserves an already-wide %s width through context open, close and file-tab unmount",
		async (width) => {
			const user = userEvent.setup();
			const { store, unmount } = renderWorkspace({ width, open: true });
			const mode = store.get(activityPanelWidthModeAtom);
			const initialWidth = store.get(activityPanelWidthAtom);
			await user.click(screen.getByRole("button", { name: "Open context file" }));
			expect(await screen.findByRole("heading", { name: "nested.md" })).toBeTruthy();
			expect(screen.getByRole("tree")).toBeTruthy();
			expect(store.get(activityPanelWidthModeAtom)).toEqual(mode);
			await user.click(screen.getByRole("button", { name: "Close" }));
			await waitFor(() => expect(store.get(inlineFilePreviewAtom)).toBeNull());
			expect(screen.queryByRole("heading", { name: "readme.md" })).toBeNull();
			expect(store.get(activityPanelWidthAtom)).toBe(initialWidth);
			expect(store.get(activityPanelWidthModeAtom)).toEqual(mode);
			await user.click(screen.getByRole("button", { name: "Open context file" }));
			expect(await screen.findByRole("heading", { name: "nested.md" })).toBeTruthy();
			unmount();
			expect(store.get(inlineFilePreviewAtom)).toBeNull();
			expect(store.get(activityPanelWidthModeAtom)).toEqual(mode);
		},
	);

	it("keeps a context preview accessible as manual resizing crosses the split threshold in both directions", async () => {
		const user = userEvent.setup();
		const { store } = renderWorkspace();
		await user.click(screen.getByRole("button", { name: "Open context file" }));
		expect(await screen.findByRole("heading", { name: "nested.md" })).toBeTruthy();
		act(() => store.set(syncActivityPanelPreviewAvailabilityAtom, 520));
		expect(await screen.findByRole("tree")).toBeTruthy();
		expect(screen.getByRole("heading", { name: "nested.md" })).toBeTruthy();
		act(() => store.set(syncActivityPanelPreviewAvailabilityAtom, 519));
		expect(screen.queryByRole("tree")).toBeNull();
		expect(screen.getByRole("heading", { name: "nested.md" })).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "Project files" }));
		expect(await screen.findByRole("treeitem", { name: "nested.md" })).toBeTruthy();
		// A repeated context click restores the preview even while the compact tree is selected.
		await user.click(screen.getByRole("button", { name: "Open context file" }));
		expect(await screen.findByRole("heading", { name: "nested.md" })).toBeTruthy();
		act(() => store.set(setActivityPanelWidthAtom, 640));
		expect(await screen.findByRole("tree")).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "Close" }));
		expect(store.get(activityPanelWidthAtom)).toBe(640);
		expect(store.get(inlineFilePreviewAtom)).toBeNull();
	});

	it("retains deliberate file-tree expansion and restores the width after closing", async () => {
		const user = userEvent.setup();
		const { store } = renderWorkspace({ open: true });
		await user.click(await screen.findByRole("treeitem", { name: "readme.md" }));
		expect(await screen.findByRole("heading", { name: "readme.md" })).toBeTruthy();
		expect(store.get(activityPanelWidthModeAtom)).toEqual({ kind: "max" });
		act(() => store.set(setActivityPanelWidthAtom, 480));
		expect(screen.getByRole("tree")).toBeTruthy();
		expect(screen.queryByRole("heading", { name: "readme.md" })).toBeNull();
		act(() => store.set(setActivityPanelWidthAtom, 720));
		expect(await screen.findByRole("heading", { name: "readme.md" })).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "Close" }));
		expect(store.get(activityPanelWidthAtom)).toBe(360);
	});

	it("forgets an earlier tree-open restore width when a context link takes over and Escape closes it", async () => {
		const user = userEvent.setup();
		const { store } = renderWorkspace({ open: true });
		await user.click(await screen.findByRole("treeitem", { name: "readme.md" }));
		expect(await screen.findByRole("heading", { name: "readme.md" })).toBeTruthy();
		act(() => store.set(setActivityPanelWidthAtom, 680));
		await user.click(screen.getByRole("button", { name: "Open context file" }));
		expect(await screen.findByRole("heading", { name: "nested.md" })).toBeTruthy();
		await user.keyboard("{Escape}");
		expect(store.get(inlineFilePreviewAtom)).toBeNull();
		expect(store.get(activityPanelWidthAtom)).toBe(680);
		expect(localStorage.getItem(ACTIVITY_PANEL_WIDTH_STORAGE_KEY)).toBe("680");
	});

	it("still selects the first file when the user drags wide, including after dismissing a context preview", async () => {
		const user = userEvent.setup();
		const { store } = renderWorkspace({ open: true });
		await user.click(screen.getByRole("button", { name: "Open context file" }));
		expect(await screen.findByRole("heading", { name: "nested.md" })).toBeTruthy();
		act(() => store.set(setActivityPanelWidthAtom, 720));
		await user.click(screen.getByRole("button", { name: "Close" }));
		expect(store.get(inlineFilePreviewAtom)).toBeNull();
		act(() => store.set(setActivityPanelWidthAtom, 360));
		act(() => store.set(setActivityPanelWidthAtom, 720));
		expect(await screen.findByRole("heading", { name: "readme.md" })).toBeTruthy();
	});

	it.each([
		{ root: null, path: filePath, viewport: 1400, preferInline: true },
		{ root: cwd, path: "/other/notes.md", viewport: 1400, preferInline: true },
		{ root: cwd, path: filePath, viewport: 600, preferInline: true },
		{ root: cwd, path: filePath, viewport: 1400, preferInline: false },
	])(
		"keeps the dialog fallback for $root, $path, viewport $viewport and inline preference $preferInline",
		async ({ viewport, ...props }) => {
			setWindowWidth(viewport);
			const user = userEvent.setup();
			const { store } = renderWorkspace(props);
			const initialWidth = store.get(activityPanelWidthAtom);
			await user.click(screen.getByRole("button", { name: "Open context file" }));
			expect(store.get(filePreviewAtom)?.path).toBe(props.path);
			expect(store.get(inlineFilePreviewAtom)).toBeNull();
			expect(store.get(activityPanelOpenAtom)).toBe(false);
			expect(store.get(activityPanelWidthAtom)).toBe(initialWidth);
		},
	);
});
