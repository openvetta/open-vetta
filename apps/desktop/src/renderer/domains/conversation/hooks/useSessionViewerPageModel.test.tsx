// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HistoryEntry } from "@vetta/runtime-core";
import { SessionViewerPageView } from "@vetta-org/theme-ui/chat";
import { createStore, Provider } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionViewerPageModel } from "./useSessionViewerPageModel";

const route = vi.hoisted(() => ({ path: "/sessions/first.jsonl" }));
vi.mock("@tanstack/react-router", () => ({ useParams: () => ({ path: encodeURIComponent(route.path) }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

type Snapshot = { history: HistoryEntry[] };
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}
function snapshot(text: string): Snapshot {
	return { history: [{ type: "message", entryId: text, message: { role: "user", content: text, timestamp: 1 } }] };
}
const openViewer = vi.fn<(path: string) => Promise<Snapshot>>();
const subscriptions = new Map<string, (snapshot: Snapshot) => void>();
const unsubscribed = vi.fn();
const subscribeViewer = vi.fn(async (path: string, listener: (snapshot: Snapshot) => void) => {
	subscriptions.set(path, listener);
	return () => unsubscribed(path);
});

function Viewer() {
	const model = useSessionViewerPageModel();
	return (
		<SessionViewerPageView
			hasPath={Boolean(model.path)}
			emptyPathLabel="No conversation selected"
			error={model.error}
			errorPrefix="Couldn't load: "
			loading={model.loading}
			loadingLabel="Loading conversation"
			retryLabel="Retry loading"
			onRetry={model.onRetry}
			exportHost={null}
			activityPanel={null}
			messageList={model.messages.map((message) => (
				<p key={message.id}>{message.kind === "user" ? message.text : message.id}</p>
			))}
		/>
	);
}

beforeEach(() => {
	route.path = "/sessions/first.jsonl";
	subscriptions.clear();
	unsubscribed.mockClear();
	subscribeViewer.mockClear();
	openViewer.mockReset().mockResolvedValue(snapshot("First conversation"));
	vi.stubGlobal("vetta", { session: { openViewer, subscribeViewer } });
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function mount() {
	const store = createStore();
	const view = render(
		<Provider store={store}>
			<Viewer />
		</Provider>,
	);
	return {
		switchTo(path: string) {
			route.path = path;
			view.rerender(
				<Provider store={store}>
					<Viewer />
				</Provider>,
			);
		},
	};
}

describe("read-only conversation viewer", () => {
	it("shows loading, recovers from a failed read through Retry and receives live updates", async () => {
		const read = deferred<Snapshot>();
		openViewer.mockReturnValueOnce(read.promise);
		mount();
		expect(screen.getByRole("status").textContent).toBe("Loading conversation");
		await act(async () => read.reject(new Error("File temporarily unavailable")));
		expect(screen.getByRole("alert").textContent).toContain("File temporarily unavailable");
		await userEvent.click(screen.getByRole("button", { name: "Retry loading" }));
		expect(await screen.findByText("First conversation")).toBeTruthy();
		expect(screen.queryByRole("alert")).toBeNull();
		await waitFor(() => expect(subscriptions.has(route.path)).toBe(true));
		act(() => subscriptions.get(route.path)?.(snapshot("Updated conversation")));
		expect(screen.getByText("Updated conversation")).toBeTruthy();
	});

	it("clears a previous error when another conversation opens successfully", async () => {
		openViewer.mockRejectedValueOnce(new Error("First file missing"));
		const view = mount();
		expect(await screen.findByRole("alert")).toBeTruthy();
		openViewer.mockResolvedValueOnce(snapshot("Second conversation"));
		view.switchTo("/sessions/second.jsonl");
		expect(screen.queryByRole("alert")).toBeNull();
		expect(await screen.findByText("Second conversation")).toBeTruthy();
	});

	it("removes old content during navigation and rejects late callbacks from the old subscription", async () => {
		const view = mount();
		await screen.findByText("First conversation");
		await waitFor(() => expect(subscriptions.has(route.path)).toBe(true));
		const oldListener = subscriptions.get(route.path);
		const second = deferred<Snapshot>();
		openViewer.mockReturnValueOnce(second.promise);
		view.switchTo("/sessions/second.jsonl");
		expect(screen.queryByText("First conversation")).toBeNull();
		expect(screen.getByRole("status").textContent).toBe("Loading conversation");
		act(() => oldListener?.(snapshot("Late first conversation")));
		expect(screen.queryByText("Late first conversation")).toBeNull();
		await act(async () => second.resolve(snapshot("Second conversation")));
		act(() => oldListener?.(snapshot("Still first conversation")));
		expect(screen.getByText("Second conversation")).toBeTruthy();
		expect(screen.queryByText("Still first conversation")).toBeNull();
		expect(unsubscribed).toHaveBeenCalledWith("/sessions/first.jsonl");
	});

	it("does not replace the current conversation with an older read that settles late", async () => {
		const first = deferred<Snapshot>();
		openViewer.mockReturnValueOnce(first.promise).mockResolvedValueOnce(snapshot("Second conversation"));
		const view = mount();
		view.switchTo("/sessions/second.jsonl");
		await screen.findByText("Second conversation");
		await act(async () => first.resolve(snapshot("Late first conversation")));
		expect(screen.getByText("Second conversation")).toBeTruthy();
		expect(screen.queryByText("Late first conversation")).toBeNull();
		expect(subscribeViewer).not.toHaveBeenCalledWith("/sessions/first.jsonl", expect.any(Function));
	});
});
