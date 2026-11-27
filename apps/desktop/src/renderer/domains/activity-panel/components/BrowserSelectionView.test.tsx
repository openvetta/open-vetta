// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BrowserSelectionView } from "@vetta-org/theme-ui/activity";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
	vi.stubGlobal("PointerEvent", MouseEvent);
	HTMLElement.prototype.setPointerCapture = vi.fn();
	HTMLElement.prototype.hasPointerCapture = () => false;
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

it("draws a region, moves it and resizes a corner without forwarding page scroll", () => {
	let pageScroll = 0;
	function Harness() {
		const [rect, setRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
		return (
			<>
				<BrowserSelectionView
					mode="region"
					viewport={{ width: 600, height: 400 }}
					rect={rect}
					disabled={false}
					label="Select region"
					onInspect={vi.fn()}
					onRegionChange={setRect}
					onScroll={(_x, y) => {
						pageScroll += y;
					}}
				/>
				<output>{JSON.stringify(rect)}</output>
			</>
		);
	}
	const { container } = render(<Harness />);
	const surface = screen.getByRole("application");
	vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 400 } as DOMRect);
	fireEvent.pointerDown(surface, { button: 0, clientX: 20, clientY: 30 });
	fireEvent.pointerMove(surface, { clientX: 220, clientY: 130 });
	fireEvent.pointerUp(surface, { clientX: 220, clientY: 130 });
	expect(screen.getByRole("status").textContent).toBe('{"x":20,"y":30,"width":200,"height":100}');
	const selection = container.querySelector('[data-capture-action="move"]')!;
	fireEvent.pointerDown(selection, { button: 0, clientX: 50, clientY: 50 });
	fireEvent.pointerUp(surface, { clientX: 80, clientY: 70 });
	expect(screen.getByRole("status").textContent).toBe('{"x":50,"y":50,"width":200,"height":100}');
	fireEvent.pointerDown(container.querySelector('[data-capture-action="se"]')!, {
		button: 0,
		clientX: 250,
		clientY: 150,
	});
	fireEvent.pointerUp(surface, { clientX: 300, clientY: 200 });
	expect(screen.getByRole("status").textContent).toBe('{"x":50,"y":50,"width":250,"height":150}');
	fireEvent.wheel(surface, { deltaY: 100 });
	expect(pageScroll).toBe(0);
});

it("forwards the pointer location with element wheel events and locks on click", () => {
	function Harness() {
		const [selection, setSelection] = useState("");
		const [scroll, setScroll] = useState("");
		return (
			<>
				<BrowserSelectionView
					mode="element"
					viewport={{ width: 600, height: 400 }}
					rect={null}
					disabled={false}
					label="Select element"
					onInspect={(x, y, lock) => setSelection(`${x},${y}:${lock ? "locked" : "hover"}`)}
					onRegionChange={() => undefined}
					onScroll={(x, y, point) => setScroll(`${x},${y}@${point.x},${point.y}`)}
				/>
				<output aria-label="Selection">{selection}</output>
				<output aria-label="Scroll">{scroll}</output>
			</>
		);
	}
	render(<Harness />);
	const surface = screen.getByRole("application");
	vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({ left: 10, top: 20, width: 300, height: 200 } as DOMRect);
	fireEvent.pointerMove(surface, { clientX: 60, clientY: 70 });
	expect(screen.getByLabelText("Selection").textContent).toBe("100,100:hover");
	fireEvent.pointerDown(surface, { button: 0, clientX: 60, clientY: 70 });
	fireEvent.pointerUp(surface, { clientX: 60, clientY: 70 });
	expect(screen.getByLabelText("Selection").textContent).toBe("100,100:locked");
	fireEvent.wheel(surface, { clientX: 60, clientY: 70, deltaX: 0, deltaY: 100 });
	expect(screen.getByLabelText("Scroll").textContent).toBe("0,100@100,100");
});

it("hovers an element then drags a region from its highlight in the same selection surface", () => {
	let locked = false;
	function Harness() {
		const [mode, setMode] = useState<"element" | "region">("element");
		const [rect, setRect] = useState({ x: 10, y: 20, width: 100, height: 40 });
		return <>
			<BrowserSelectionView mode={mode} viewport={{ width: 600, height: 400 }} rect={rect}
				disabled={false} label="Select screenshot" onInspect={(_x, _y, lock) => { locked = lock; }}
				onRegionChange={(value) => { setMode("region"); setRect(value); }} onScroll={() => undefined} />
			<output>{JSON.stringify(rect)}</output>
		</>;
	}
	const { container } = render(<Harness />);
	const surface = screen.getByRole("application");
	vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 400 } as DOMRect);
	fireEvent.pointerMove(surface, { clientX: 20, clientY: 30 });
	expect(locked).toBe(false);
	fireEvent.pointerDown(container.querySelector('[data-capture-action="move"]')!, { button: 0, clientX: 20, clientY: 30 });
	fireEvent.pointerMove(surface, { clientX: 22, clientY: 31 });
	expect(screen.getByRole("status").textContent).toBe('{"x":10,"y":20,"width":100,"height":40}');
	fireEvent.pointerMove(surface, { clientX: 220, clientY: 130 });
	fireEvent.pointerUp(surface, { clientX: 220, clientY: 130 });
	expect(screen.getByRole("status").textContent).toBe('{"x":20,"y":30,"width":200,"height":100}');
	expect(locked).toBe(false);
	fireEvent.pointerMove(surface, { clientX: 400, clientY: 300 });
	expect(screen.getByRole("status").textContent).toBe('{"x":20,"y":30,"width":200,"height":100}');
});
