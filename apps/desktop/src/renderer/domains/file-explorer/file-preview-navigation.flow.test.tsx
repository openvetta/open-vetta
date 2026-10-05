// @vitest-environment jsdom
import { i18n, initI18n } from "@shared/i18n";
import {
	activeSessionAtom,
	activityPanelWidthAtom,
	expandedDirsAtom,
	type FsEntry,
	fileExplorerPreferencesAtom,
	filePreviewAtom,
	fileTreeCacheAtom,
	inlineFilePreviewAtom,
} from "@shared/store/atoms";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revealPluginFileExplorerPath } from "../plugins/runtime/plugin-file-explorer-host";
import { FilesPanel } from "./components/FilesPanel";

const scrollIntoView = vi.hoisted(() => vi.fn());
// jsdom cannot measure a virtual viewport. Keep the real tree rows and interaction wiring.
vi.mock("react-virtuoso", async () => {
	const React = await import("react");
	return {
		Virtuoso: React.forwardRef(function Viewport(
			props: { data: { key: string }[]; itemContent: (index: number, item: { key: string }) => ReactNode },
			ref,
		) {
			React.useImperativeHandle(ref, () => ({ scrollIntoView }));
			return (
				<>
					{props.data.map((item, index) => (
						<div key={item.key}>{props.itemContent(index, item)}</div>
					))}
				</>
			);
		}),
	};
});
const entry = (path: string, isDirectory = false): FsEntry => ({
	path,
	name: path.split(/[\\/]/).at(-1) ?? path,
	isDirectory,
	size: 1,
	modifiedAt: 0,
});
const readDir = vi.fn<(path: string) => Promise<FsEntry[]>>();
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
function setup(root = "/project") {
	const store = createStore();
	store.set(activityPanelWidthAtom, 360);
	store.set(activeSessionAtom, { cwd: root, sessionPath: "session-a", runtimeId: "runtime-a" });
	const view = render(
		<Provider store={store}>
			<FilesPanel cwd={root} />
		</Provider>,
	);
	return {
		store,
		...view,
		switchRoot(next: string) {
			act(() => store.set(activeSessionAtom, { cwd: next, sessionPath: "session-b", runtimeId: "runtime-b" }));
			view.rerender(
				<Provider store={store}>
					<FilesPanel cwd={next} />
				</Provider>,
			);
		},
	};
}
function selectPreview(store: ReturnType<typeof createStore>, path: string) {
	act(() => store.set(inlineFilePreviewAtom, { name: entry(path).name, path }));
}
beforeEach(async () => {
	initI18n();
	await i18n.changeLanguage("en");
	Object.defineProperty(window, "innerWidth", { configurable: true, value: 1400 });
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: {
			fs: { readDir, watchDir: vi.fn(), unwatchDir: vi.fn(), onDirChanged: () => () => {}, cacheDragIcon: vi.fn() },
		},
	});
	// Browser CSS image lookup is outside the selection behavior under test.
	const computedStyle = window.getComputedStyle;
	vi.spyOn(window, "getComputedStyle").mockImplementation((element) => computedStyle(element));
	scrollIntoView.mockClear();
	readDir.mockReset();
	readDir.mockImplementation(
		async (path) =>
			new Map([
				["/project", [entry("/project/src", true), entry("/project/other.ts")]],
				["/project/src", [entry("/project/src/deep", true)]],
				["/project/src/deep", [entry("/project/src/deep/one.ts"), entry("/project/src/deep/two.ts")]],
				["/other", [entry("/other/fresh.ts")]],
			]).get(path) ?? [],
	);
});

afterEach(() => vi.restoreAllMocks());

describe("preview and file-tree navigation", () => {
	it("reveals a nested preview through lazy ancestors, selects and scrolls it, then follows the next file without rereading the tree", async () => {
		const { store } = setup();
		await screen.findByText("src");
		const user = userEvent.setup();
		await user.click(screen.getByText("other.ts"));
		selectPreview(store, "/project/src/deep/one.ts");
		const row = (await screen.findByText("one.ts")).closest('[role="treeitem"]');
		await waitFor(() => expect(row?.getAttribute("aria-selected")).toBe("true"));
		expect(store.get(expandedDirsAtom)).toEqual(new Set(["/project/src", "/project/src/deep"]));
		expect(scrollIntoView).toHaveBeenCalledWith({ index: 2 });
		readDir.mockClear();
		scrollIntoView.mockClear();
		selectPreview(store, "/project/src/deep/two.ts");
		await waitFor(() =>
			expect(screen.getByText("two.ts").closest('[role="treeitem"]')?.getAttribute("aria-selected")).toBe("true"),
		);
		expect(scrollIntoView).toHaveBeenCalledWith({ index: 3 });
		expect(readDir).not.toHaveBeenCalled();
		// Manual collapse/selection remains a user choice until a different file is previewed.
		await user.click(screen.getByRole("button", { name: "Collapse all" }));
		expect(screen.queryByText("two.ts")).toBeNull();
		expect(store.get(expandedDirsAtom).size).toBe(0);
	});
	it("does not steal keyboard focus from the conversation while revealing a file", async () => {
		const { store } = setup();
		await screen.findByText("src");
		const input = document.createElement("input");
		document.body.append(input);
		input.focus();
		selectPreview(store, "/project/src/deep/one.ts");
		await screen.findByText("one.ts");
		expect(document.activeElement).toBe(input);
		input.remove();
	});
	it("ignores late ancestor reads after the preview changes", async () => {
		const pending = deferred<FsEntry[]>();
		readDir.mockImplementation(async (path) =>
			path === "/project" ? [entry("/project/src", true), entry("/project/other.ts")] : pending.promise,
		);
		const { store } = setup();
		await screen.findByText("src");
		selectPreview(store, "/project/src/stale.ts");
		await waitFor(() => expect(readDir).toHaveBeenCalledWith("/project/src"));
		selectPreview(store, "/project/other.ts");
		await waitFor(() =>
			expect(screen.getByText("other.ts").closest('[role="treeitem"]')?.getAttribute("aria-selected")).toBe("true"),
		);
		await act(async () => pending.resolve([entry("/project/src/stale.ts")]));
		expect(store.get(expandedDirsAtom).has("/project/src")).toBe(false);
		expect(screen.queryByText("stale.ts")).toBeNull();
	});
	it("does not populate or select the wrong project after a pending read resolves", async () => {
		const pending = deferred<FsEntry[]>();
		readDir.mockImplementation(async (path) =>
			path === "/project"
				? [entry("/project/src", true)]
				: path === "/project/src"
					? pending.promise
					: [entry("/other/fresh.ts")],
		);
		const view = setup();
		await screen.findByText("src");
		selectPreview(view.store, "/project/src/stale.ts");
		await waitFor(() => expect(readDir).toHaveBeenCalledWith("/project/src"));
		view.switchRoot("/other");
		await screen.findByText("fresh.ts");
		await act(async () => pending.resolve([entry("/project/src/stale.ts")]));
		expect([...view.store.get(fileTreeCacheAtom).keys()]).toEqual(["/other"]);
		expect(view.store.get(expandedDirsAtom).size).toBe(0);
		expect(screen.queryByText("stale.ts")).toBeNull();
	});
	it("missing or outside-root previews leave the current selection usable and never traverse outside the root", async () => {
		const { store } = setup();
		await screen.findByText("src");
		fireEvent.click(screen.getByText("other.ts"));
		readDir.mockClear();
		selectPreview(store, "/outside/secret.ts");
		selectPreview(store, "/project/../outside/secret.ts");
		expect(readDir).not.toHaveBeenCalled();
		selectPreview(store, "/project/missing.ts");
		await waitFor(() => expect(readDir).toHaveBeenCalledWith("/project"));
		expect(screen.getByText("other.ts").closest('[role="treeitem"]')?.getAttribute("aria-selected")).toBe("true");
		expect(store.get(expandedDirsAtom).size).toBe(0);
	});
	it.each(["C:\\project", "\\\\server\\share\\project", "ssh://build-host/srv/project"])(
		"reveals canonical entries beneath %s without manufacturing a local remote path",
		async (root) => {
			const separator = root.includes("\\") ? "\\" : "/";
			const directory = `${root}${separator}src`;
			const file = `${directory}${separator}one.ts`;
			readDir.mockImplementation(async (path) =>
				path === root ? [entry(directory, true)] : path === directory ? [entry(file)] : [],
			);
			const { store } = setup(root);
			await screen.findByText("src");
			const previewPath = file.replaceAll("\\", "/");
			selectPreview(store, root.startsWith("ssh://") ? previewPath : previewPath.toUpperCase());
			const row = (await screen.findByText("one.ts")).closest('[role="treeitem"]');
			await waitFor(() => expect(row?.getAttribute("aria-selected")).toBe("true"));
			expect(store.get(expandedDirsAtom)).toEqual(new Set([directory]));
			expect(readDir.mock.calls.map(([path]) => path)).toEqual([root, directory]);
		},
	);
	it("follows a local file opened in a dialog too", async () => {
		const { store } = setup();
		await screen.findByText("src");
		act(() => store.set(filePreviewAtom, { name: "one.ts", path: "/project/src/deep/one.ts" }));
		const row = (await screen.findByText("one.ts")).closest('[role="treeitem"]');
		await waitFor(() => expect(row?.getAttribute("aria-selected")).toBe("true"));
	});
	it("does not reveal a previous session's file when switching sessions within the same project", async () => {
		const pending = deferred<FsEntry[]>();
		readDir.mockImplementation(async (path) =>
			path === "/project" ? [entry("/project/src", true)] : pending.promise,
		);
		const view = setup();
		await screen.findByText("src");
		selectPreview(view.store, "/project/src/stale.ts");
		await waitFor(() => expect(readDir).toHaveBeenCalledWith("/project/src"));
		view.switchRoot("/project");
		await act(async () => pending.resolve([entry("/project/src/stale.ts")]));
		expect([...view.store.get(fileTreeCacheAtom).keys()]).toEqual(["/project"]);
		expect(view.store.get(expandedDirsAtom).size).toBe(0);
		expect(screen.queryByText("stale.ts")).toBeNull();
		readDir.mockImplementation(async (path) =>
			path === "/project/src" ? [entry("/project/src/current.ts")] : [entry("/project/src", true)],
		);
		selectPreview(view.store, "/project/src/current.ts");
		await screen.findByText("current.ts");
	});
	it("does not commit a directory read after unmount", async () => {
		const pending = deferred<FsEntry[]>();
		readDir.mockImplementation(async () => pending.promise);
		const { store, unmount } = setup();
		unmount();
		await act(async () => pending.resolve([entry("/project/stale.ts")]));
		expect(store.get(fileTreeCacheAtom).size).toBe(0);
	});
	it("keeps excluded files hidden and does not read their ancestors", async () => {
		const { store } = setup();
		await screen.findByText("src");
		act(() =>
			store.set(fileExplorerPreferencesAtom, {
				schemaVersion: 1,
				showHidden: true,
				exclude: ["src/**"],
				iconTheme: "builtin",
			}),
		);
		readDir.mockClear();
		selectPreview(store, "/project/src/deep/one.ts");
		expect(readDir).not.toHaveBeenCalled();
		expect(store.get(expandedDirsAtom).size).toBe(0);
	});
	it("honors a refresh requested during a pending directory read instead of dropping it", async () => {
		const initial = deferred<FsEntry[]>();
		const refreshed = deferred<FsEntry[]>();
		readDir.mockReturnValueOnce(initial.promise).mockReturnValueOnce(refreshed.promise);
		setup();
		fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
		await act(async () => initial.resolve([entry("/project/old.ts")]));
		await waitFor(() => expect(readDir).toHaveBeenCalledTimes(2));
		await act(async () => refreshed.resolve([entry("/project/new.ts")]));
		await screen.findByText("new.ts");
		expect(screen.queryByText("old.ts")).toBeNull();
	});
	it("preserves the selected file when an ancestor cannot be read, then reveals it on a later retry", async () => {
		const { store } = setup();
		await screen.findByText("src");
		fireEvent.click(screen.getByText("other.ts"));
		vi.spyOn(console, "error").mockImplementation(() => {});
		readDir.mockRejectedValueOnce(new Error("permission denied"));
		selectPreview(store, "/project/src/one.ts");
		await waitFor(() => expect(readDir).toHaveBeenCalledWith("/project/src"));
		expect(screen.getByText("other.ts").closest('[role="treeitem"]')?.getAttribute("aria-selected")).toBe("true");
		expect(store.get(expandedDirsAtom).size).toBe(0);
		readDir.mockImplementation(async () => [entry("/project/src/one.ts")]);
		selectPreview(store, "/project/src/one.ts");
		const row = (await screen.findByText("one.ts")).closest('[role="treeitem"]');
		await waitFor(() => expect(row?.getAttribute("aria-selected")).toBe("true"));
	});
	it("cancels a queued plugin focus request when the session changes before the next frame", async () => {
		const frames: FrameRequestCallback[] = [];
		vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
			frames.push(callback);
			return frames.length;
		});
		const view = setup();
		await screen.findByText("other.ts");
		const input = document.createElement("input");
		document.body.append(input);
		input.focus();
		await act(async () => revealPluginFileExplorerPath("/project/other.ts", { focus: true }));
		view.switchRoot("/project");
		await act(async () => {
			for (const callback of frames.splice(0)) callback(0);
		});
		expect(document.activeElement).toBe(input);
		input.remove();
	});
	it("reveals a newly created file even when an older refresh is already in flight", async () => {
		const { store } = setup();
		await screen.findByText("src");
		const stale = deferred<FsEntry[]>();
		const fresh = deferred<FsEntry[]>();
		readDir.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise);
		fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
		selectPreview(store, "/project/new.ts");
		await act(async () => stale.resolve([entry("/project/src", true)]));
		await act(async () => fresh.resolve([entry("/project/src", true), entry("/project/new.ts")]));
		const row = (await screen.findByText("new.ts")).closest('[role="treeitem"]');
		await waitFor(() => expect(row?.getAttribute("aria-selected")).toBe("true"));
	});
});
