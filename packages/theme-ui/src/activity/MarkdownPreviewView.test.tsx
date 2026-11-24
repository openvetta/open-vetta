// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownPreviewView } from "./MarkdownPreviewView";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mounted: Root[] = [];

function render(node: ReactNode): { container: HTMLDivElement } {
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	mounted.push(root);
	act(() => root.render(node));
	return { container };
}

const section = (index: number) => `## Section ${index}\n\n${"word ".repeat(600)}\n`;

describe("MarkdownPreviewView", () => {
	afterEach(() => {
		for (const root of mounted.splice(0)) act(() => root.unmount());
		vi.useRealTimers();
	});

	it("renders a large document section by section without losing content", async () => {
		vi.useFakeTimers();
		const content = Array.from({ length: 40 }, (_, index) => section(index)).join("\n");
		const { container } = render(<MarkdownPreviewView content={content} theme="light" onOpenExternal={() => {}} />);

		const firstPass = container.querySelectorAll("h2").length;
		expect(firstPass).toBeGreaterThan(0);
		expect(firstPass).toBeLessThan(40);

		// Each section schedules the next one after it commits.
		for (let step = 0; step < 40; step++) {
			await act(async () => {
				await vi.runOnlyPendingTimersAsync();
			});
		}
		expect(container.querySelectorAll("h2")).toHaveLength(40);
	});

	it("renders a small document in one pass", () => {
		const { container } = render(
			<MarkdownPreviewView content={"# Title\n\nbody"} theme="light" onOpenExternal={() => {}} />,
		);
		expect(container.querySelector("h1")?.textContent).toBe("Title");
	});
});
