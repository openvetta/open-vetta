// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiffPane } from "../src/components/DiffPane";
import { setGitCommand } from "../src/git/runtime";
import type { ChangeEntry } from "../src/git/types";

vi.mock("@vetta-org/plugin-sdk", () => ({
	useTranslation: () => ({ t: (key: string) => key, locale: "en" }),
}));

const LINE_COUNT = 3000;

/** A single-file patch with enough lines that rendering all of them is the bug. */
function bigPatch(): string {
	const body = Array.from({ length: LINE_COUNT }, (_, i) => `+\tconst value${i} = compute(${i});`);
	return [
		"diff --git a/src/huge.ts b/src/huge.ts",
		"new file mode 100644",
		"--- /dev/null",
		"+++ b/src/huge.ts",
		`@@ -0,0 +1,${LINE_COUNT} @@`,
		...body,
		"",
	].join("\n");
}

const entry: ChangeEntry = { path: "src/huge.ts", code: "A" };

function renderedLineCount(container: HTMLElement): number {
	return container.querySelector("diffs-container")?.shadowRoot?.querySelectorAll("[data-line]").length ?? 0;
}

beforeEach(() => {
	localStorage.clear();
	setGitCommand({
		run: async () => ({ exitCode: 0, stderr: "", stdout: bigPatch() }),
	});
	Object.defineProperty(CSSStyleSheet.prototype, "replaceSync", { configurable: true, value() {} });
	// jsdom has no layout: give the diff pane a measurable viewport so the
	// virtualizer can pick a line window.
	vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 600, 600));
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
	// The virtualizer only needs "is this file section on screen"; keep it always
	// visible so the window, not the observer, decides what is rendered.
	vi.stubGlobal(
		"IntersectionObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("diff pane virtualization", () => {
	it("keeps the rendered line count bounded instead of materializing the whole patch", async () => {
		const { container } = render(
			<DiffPane root="/repo" entry={entry} section="unstaged" />,
		);

		await waitFor(() => expect(renderedLineCount(container)).toBeGreaterThan(0));

		// A wrapped line re-flows on every pane width change, so the DOM size is
		// what decides whether dragging the splitter (or collapsing the sidebar)
		// stalls the whole window. All 3000 lines in the DOM is the regression.
		const rendered = renderedLineCount(container);
		expect(rendered).toBeLessThan(LINE_COUNT / 4);
		expect(container.querySelector("diffs-container")?.shadowRoot?.textContent).toContain("value0");
	});
});
