// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createStore, getDefaultStore, Provider } from "jotai";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activeInputDraftKeyAtom, browserCapturesAtom, toastsAtom } from "@shared/store/atoms";
import { BrowserCaptureDraftCards } from "@shared/components/BrowserCaptures";
import { BrowserCaptureDialog } from "@shared/components/BrowserCaptureDialog";
import { BrowserSelectionView } from "@vetta-org/theme-ui/activity";
import type { DesktopApi } from "@preload/api";
import { useBrowserCapture, type CaptureGuest } from "./useBrowserCapture";

const translated = vi.hoisted(() => ({ t: (key: string) => key === "browserCapture.add" ? "Add screenshot" : key === "browserCapture.note" ? "Preview note" : key }));
vi.mock("react-i18next", () => ({ useTranslation: () => translated }));

const inspection = {
	url: "http://localhost:3000/",
	title: "Demo",
	viewport: { width: 600, height: 400 },
	elements: [
		{ rect: { x: 10, y: 20, width: 100, height: 40 }, element: { tag: "button", text: "Save", locator: "#save" } },
		{ rect: { x: 0, y: 0, width: 600, height: 200 }, element: { tag: "section", text: "Save", locator: "#toolbar" } },
	],
};

let captureTestGuest: CaptureGuest;

function Harness() {
	const guest = useRef(
		Object.assign(document.createElement("div"), {
			getWebContentsId: () => 42,
			getURL: () => inspection.url,
		}) as CaptureGuest,
	);
	const capture = useBrowserCapture(guest, "workspace-1");
	captureTestGuest = guest.current;
	return (
		<>
			<output aria-label="Capture mode">{capture.mode ?? "idle"}</output>
			<button onClick={capture.start}>Select screenshot</button>
			{capture.mode && capture.inspection ? (
				<>
					<BrowserSelectionView mode={capture.mode} viewport={capture.inspection.viewport}
						rect={capture.rect} disabled={capture.busy} label="Select screenshot"
						onInspect={capture.inspect} onRegionChange={capture.setRegion} onScroll={capture.scroll} />
					<button onClick={() => void capture.inspect(15, 25, true)}>Pick Save</button>
					<button onClick={capture.expand}>Expand</button>
					<button onClick={() => capture.setRegion({ x: 20, y: 30, width: 200, height: 100 })}>Draw region</button>
					<button onClick={() => void capture.confirm()}>Confirm screenshot</button>
					<span>{capture.rect?.width}</span>
				</>
			) : null}
			{capture.busy ? <span>Capturing</span> : null}
			{capture.preview ? (
				<BrowserCaptureDialog capture={capture.preview} onCancel={capture.cancel} onSave={capture.add} />
			) : null}
			<BrowserCaptureDraftCards />
		</>
	);
}

beforeEach(() => {
	vi.stubGlobal("PointerEvent", MouseEvent);
	HTMLElement.prototype.setPointerCapture = vi.fn();
	HTMLElement.prototype.hasPointerCapture = () => false;
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		callback(0);
		return 1;
	});
	vi.stubGlobal(
		"Image",
		class {
			naturalWidth = 1200;
			naturalHeight = 800;
			src = "";
			decode = async () => undefined;
		},
	);
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
		drawImage: () => undefined,
		strokeRect: () => undefined,
	} as unknown as CanvasRenderingContext2D);
	vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,cG5n");
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	getDefaultStore().set(toastsAtom, []);
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function setup(
	capturePage: DesktopApi["browserCapture"]["capture"] = async () => ({ data: "cG5n", width: 1200, height: 800 }),
) {
	const store = createStore();
	store.set(activeInputDraftKeyAtom, "conversation-a");
	let imageId = 0;
	const api: Pick<DesktopApi, "browserCapture"> & { dialog: Pick<DesktopApi["dialog"], "persistImages"> } = {
		browserCapture: { inspect: async () => inspection, capture: capturePage, scroll: async () => undefined },
		dialog: { persistImages: async () => [{ path: `C:/capture-${++imageId}.png`, format: "png", sizeBytes: 3 }] },
	};
	Object.defineProperty(window, "vetta", { configurable: true, value: api });
	render(
		<Provider store={store}>
			<Harness />
		</Provider>,
	);
	return store;
}

describe("browser screenshot workflow", () => {
	it("captures an element after viewport layout changes instead of cancelling selection", async () => {
		let resize: ResizeObserverCallback | undefined;
		let observed: Element | undefined;
		vi.stubGlobal("ResizeObserver", class {
			constructor(callback: ResizeObserverCallback) { resize = callback; }
			observe(target: Element) { observed = target; }
			unobserve() {}
			disconnect() {}
		});
		const store = setup();
		fireEvent.click(screen.getByText("Select screenshot"));
		fireEvent.click(await screen.findByText("Pick Save"));
		await waitFor(() => expect(screen.getByText("100")).toBeTruthy());
		act(() => {
			for (const height of [400, 300]) {
				resize?.([{ target: observed, contentRect: { width: 600, height } } as ResizeObserverEntry], {} as ResizeObserver);
			}
		});
		fireEvent.click(screen.getByText("Confirm screenshot"));
		fireEvent.click(await screen.findByText("Add screenshot"));
		expect(store.get(browserCapturesAtom)).toHaveLength(1);
		expect(getDefaultStore().get(toastsAtom).map((toast) => toast.message)).not.toContain("browserCapture.changed");
	});
	it("does not discard a screenshot when capture feedback resizes the guest", async () => {
		let resize: ResizeObserverCallback | undefined;
		let observed: Element | undefined;
		vi.stubGlobal("ResizeObserver", class {
			constructor(callback: ResizeObserverCallback) { resize = callback; }
			observe(target: Element) { observed = target; }
			unobserve() {}
			disconnect() {}
		});
		const notifySize = (height: number) => {
			resize?.([{ target: observed, contentRect: { width: 600, height } } as ResizeObserverEntry], {} as ResizeObserver);
		};
		let finish: ((value: { data: string; width: number; height: number }) => void) | undefined;
		const store = setup(() => new Promise((resolve) => { finish = resolve; }));
		fireEvent.click(screen.getByText("Select screenshot"));
		fireEvent.click(await screen.findByText("Pick Save"));
		await waitFor(() => expect(screen.getByText("100")).toBeTruthy());
		act(() => notifySize(400));
		fireEvent.click(screen.getByText("Confirm screenshot"));
		act(() => notifySize(399));
		await act(async () => { finish?.({ data: "cG5n", width: 1200, height: 800 }); });
		fireEvent.click(await screen.findByText("Add screenshot"));
		expect(store.get(browserCapturesAtom)).toHaveLength(1);
		expect(getDefaultStore().get(toastsAtom).map((toast) => toast.message)).not.toContain("browserCapture.changed");
	});

	it("ignores iframe navigation but cancels selection for main-frame navigation", async () => {
		const store = setup();
		const guest = captureTestGuest;
		fireEvent.click(screen.getByText("Select screenshot"));
		fireEvent.click(await screen.findByText("Pick Save"));
		await waitFor(() => expect(screen.getByText("100")).toBeTruthy());
		act(() => guest?.dispatchEvent(Object.assign(new Event("did-start-navigation"), { isMainFrame: false })));
		expect(screen.getByLabelText("Capture mode").textContent).toBe("element");
		act(() => guest?.dispatchEvent(Object.assign(new Event("did-start-navigation"), { isMainFrame: true })));
		expect(screen.getByLabelText("Capture mode").textContent).toBe("idle");
		expect(store.get(browserCapturesAtom)).toEqual([]);
		expect(getDefaultStore().get(toastsAtom).map((toast) => toast.message)).toContain("browserCapture.changed");
	});
	it.each([false, true])("captures the original hit chain when the selection center hits another element (expanded: %s)", async (expand) => {
		const store = setup();
		window.vetta.browserCapture.inspect = async (_id, point) => ({
			...inspection,
			elements: point.x === 15 && point.y === 25 ? inspection.elements : [{
				rect: { x: 50, y: 30, width: 20, height: 20 },
				element: { tag: "div", text: "Overlay", locator: "#overlay" },
			}],
		});
		fireEvent.click(screen.getByText("Select screenshot"));
		fireEvent.click(await screen.findByText("Pick Save"));
		await waitFor(() => expect(screen.getByText("100")).toBeTruthy());
		if (expand) fireEvent.click(screen.getByText("Expand"));
		fireEvent.click(screen.getByText("Confirm screenshot"));
		fireEvent.click(await screen.findByText("Add screenshot"));
		expect(store.get(browserCapturesAtom)[0]).toMatchObject({
			mode: "element",
			element: expand ? inspection.elements[1].element : inspection.elements[0].element,
			rect: expand ? inspection.elements[1].rect : inspection.elements[0].rect,
		});
		expect(getDefaultStore().get(toastsAtom).map((toast) => toast.message)).not.toContain("browserCapture.changed");
	});

	it("captures the current page after an element moves, retaining the chosen rectangle", async () => {
		let pageState = "before movement";
		let capturedState = "";
		const store = setup(async () => {
			capturedState = pageState;
			return { data: "cG5n", width: 1200, height: 800 };
		});
		fireEvent.click(screen.getByText("Select screenshot"));
		fireEvent.click(await screen.findByText("Pick Save"));
		await waitFor(() => expect(screen.getByText("100")).toBeTruthy());
		window.vetta.browserCapture.inspect = async () => ({
			...inspection,
			elements: inspection.elements.map((item) => ({ ...item, rect: { ...item.rect, x: item.rect.x + 20 } })),
		});
		pageState = "after movement";
		fireEvent.click(screen.getByText("Confirm screenshot"));
		fireEvent.change(await screen.findByLabelText("Preview note"), { target: { value: "Use this area" } });
		fireEvent.click(screen.getByText("Add screenshot"));
		expect(capturedState).toBe("after movement");
		expect(store.get(browserCapturesAtom)[0]).toMatchObject({
			mode: "element", rect: inspection.elements[0].rect, note: "Use this area",
		});
		expect(getDefaultStore().get(toastsAtom).map((toast) => toast.message)).not.toContain("browserCapture.changed");
	});
	it("hovers then drags and annotates a region through one entry without a late hover replacing it", async () => {
		const store = setup();
		fireEvent.click(screen.getByText("Select screenshot"));
		const surface = await screen.findByRole("application");
		vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 400 } as DOMRect);
		fireEvent.pointerMove(surface, { clientX: 15, clientY: 25 });
		await waitFor(() => expect(screen.getByText("100")).toBeTruthy());
		const inspect = window.vetta.browserCapture.inspect;
		let finishHover: ((value: typeof inspection) => void) | undefined;
		window.vetta.browserCapture.inspect = () => new Promise((resolve) => { finishHover = resolve; });
		fireEvent.pointerMove(surface, { clientX: 20, clientY: 30 });
		fireEvent.pointerDown(surface, { button: 0, clientX: 20, clientY: 30 });
		fireEvent.pointerMove(surface, { clientX: 220, clientY: 130 });
		fireEvent.pointerUp(surface, { clientX: 220, clientY: 130 });
		await act(async () => { finishHover?.(inspection); });
		expect(screen.getByLabelText("Capture mode").textContent).toBe("region");
		expect(screen.getByText("200")).toBeTruthy();
		window.vetta.browserCapture.inspect = inspect;
		fireEvent.click(screen.getByText("Confirm screenshot"));
		fireEvent.change(await screen.findByLabelText("Preview note"), { target: { value: "Adjust spacing" } });
		fireEvent.click(screen.getByText("Add screenshot"));
		expect(store.get(browserCapturesAtom)[0]).toMatchObject({
			mode: "region", note: "Adjust spacing", rect: { x: 20, y: 30, width: 200, height: 100 },
		});
		expect(store.get(browserCapturesAtom)[0].element).toBeUndefined();
	});
	it("exits selection when an older preload has no screenshot bridge instead of leaving a dead overlay", async () => {
		const frames: FrameRequestCallback[] = [];
		const store = setup();
		Object.defineProperty(window, "vetta", { configurable: true, value: { dialog: window.vetta.dialog } });
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
		fireEvent.click(screen.getByText("Select screenshot"));
		await act(async () => {
			frames.shift()?.(0);
			frames.shift()?.(0);
		});
		expect(screen.queryByText("Draw region")).toBeNull();
		expect(screen.getByLabelText("Capture mode").textContent).toBe("idle");
		expect(getDefaultStore().get(toastsAtom).map((toast) => toast.message)).toContain("browserCapture.restartRequired");
		expect(store.get(browserCapturesAtom)).toEqual([]);
	});
	it("recovers from a synchronous bridge failure and allows selection to be retried", async () => {
		setup();
		const inspect = window.vetta.browserCapture.inspect;
		window.vetta.browserCapture.inspect = () => { throw new Error("Host API access denied"); };
		fireEvent.click(screen.getByText("Select screenshot"));
		await waitFor(() => expect(screen.getByLabelText("Capture mode").textContent).toBe("idle"));
		expect(getDefaultStore().get(toastsAtom).map((toast) => toast.message)).toContain("browserCapture.failed");
		window.vetta.browserCapture.inspect = inspect;
		fireEvent.click(screen.getByText("Select screenshot"));
		fireEvent.click(await screen.findByText("Pick Save"));
		await waitFor(() => expect(screen.getByText("100")).toBeTruthy());
	});
	it("coalesces rapid pointer movement while an element inspection is in flight", async () => {
		setup();
		fireEvent.click(screen.getByText("Select screenshot"));
		await screen.findByText("Draw region");
		const finishes: Array<(result: typeof inspection) => void> = [];
		const points: Array<{ x: number; y: number }> = [];
		let inFlight = 0;
		let maxInFlight = 0;
		const inspect = async (_guestId: number, point: { x: number; y: number }) => {
			points.push(point);
			inFlight++;
			maxInFlight = Math.max(maxInFlight, inFlight);
			try {
				return await new Promise<typeof inspection>((resolve) => finishes.push(resolve));
			} finally {
				inFlight--;
			}
		};
		window.vetta.browserCapture.inspect = inspect;
		vi.useFakeTimers();
		const surface = screen.getByRole("application");
		vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
			left: 0,
			top: 0,
			width: 600,
			height: 400,
		} as DOMRect);

		act(() => {
			fireEvent.pointerMove(surface, { clientX: 5, clientY: 3 });
		});
		await act(async () => {
			await Promise.resolve();
		});
		expect(inFlight).toBe(1);
		act(() => {
			for (let point = 2; point <= 20; point++) {
				fireEvent.pointerMove(surface, { clientX: point * 5, clientY: point * 3 });
			}
		});
		await act(async () => {
			finishes[0]?.(inspection);
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(50);
			await Promise.resolve();
		});
		expect(maxInFlight).toBe(1);
		expect(points.at(-1)).toEqual({ x: 100, y: 60 });
		await act(async () => {
			finishes[1]?.({
				...inspection,
				elements: [
					{ ...inspection.elements[0]!, rect: { ...inspection.elements[0]!.rect, width: 100 } },
				],
			});
		});
		expect(screen.getByText("100")).toBeTruthy();
		vi.useRealTimers();
	});
	it("selects an element, expands it, annotates it, then independently edits and removes two captures", async () => {
		const store = setup();
		fireEvent.click(screen.getByText("Select screenshot"));
		fireEvent.click(await screen.findByText("Pick Save"));
		await waitFor(() => expect(screen.getByText("100")).toBeTruthy());
		fireEvent.click(screen.getByText("Expand"));
		expect(screen.getByText("600")).toBeTruthy();
		fireEvent.click(screen.getByText("Confirm screenshot"));
		fireEvent.change(await screen.findByLabelText("Preview note"), { target: { value: "Move the toolbar" } });
		fireEvent.click(screen.getByText("Add screenshot"));
		expect(store.get(browserCapturesAtom)[0]).toMatchObject({
			note: "Move the toolbar",
			element: { tag: "section" },
			rect: { width: 600 },
			width: 1200,
		});
		fireEvent.click(screen.getByText("Select screenshot"));
		fireEvent.click(await screen.findByText("Draw region"));
		fireEvent.click(screen.getByText("Confirm screenshot"));
		fireEvent.click(await screen.findByText("Add screenshot"));
		expect(screen.queryByRole("textbox")).toBeNull();
		fireEvent.click(screen.getAllByRole("button", {name: "Demo"})[1]);
		fireEvent.change(screen.getByRole("textbox"), {target: {value: "Discard this"}});
		fireEvent.click(screen.getByRole("button", {name:"browserCapture.cancel"}));
		fireEvent.click(screen.getAllByRole("button", {name: "Demo"})[1]);
		expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
		fireEvent.change(screen.getByRole("textbox"), { target: { value: "Change spacing" } });
		fireEvent.click(screen.getByRole("button", {name:"browserCapture.save"}));
		expect(store.get(browserCapturesAtom).map((item) => item.note)).toEqual(["Move the toolbar", "Change spacing"]);
		fireEvent.click(screen.getAllByRole("button", { name: "browserCapture.remove" })[0]);
		expect(store.get(browserCapturesAtom)).toHaveLength(1);
		expect(store.get(browserCapturesAtom)[0]).toMatchObject({ mode: "region", note: "Change spacing" });
	});
	it("cancels selection with Escape before attaching anything", async () => {
		const store = setup();
		fireEvent.click(screen.getByText("Select screenshot"));
		await screen.findByText("Draw region");
		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByText("Draw region")).toBeNull();
		expect(store.get(browserCapturesAtom)).toEqual([]);
	});
	it("does not attach a screenshot whose asynchronous capture finishes after a conversation switch", async () => {
		let finish: ((result: { data: string; width: number; height: number }) => void) | undefined;
		const store = setup(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		fireEvent.click(screen.getByText("Select screenshot"));
		fireEvent.click(await screen.findByText("Draw region"));
		fireEvent.click(screen.getByText("Confirm screenshot"));
		await waitFor(() => expect(screen.getByText("Capturing")).toBeTruthy());
		await act(async () => {
			store.set(activeInputDraftKeyAtom, "conversation-b");
		});
		await act(async () => {
			finish?.({ data: "cG5n", width: 1200, height: 800 });
		});
		expect(screen.queryByText("Add screenshot")).toBeNull();
		expect(store.get(browserCapturesAtom)).toEqual([]);
	});
});
