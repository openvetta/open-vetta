// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { codeToHtml } = vi.hoisted(() => ({
	codeToHtml: vi.fn(
		async (code: string, options: { theme: string }) =>
			`<pre data-highlight-theme="${options.theme}"><code>highlighted:${code}</code></pre>`,
	),
}));
vi.mock("shiki", () => ({
	codeToHtml,
}));

const { MarkdownContent } = await import("@vetta-org/theme-ui/markdown");
const { SyntaxHighlightedCode } = await import("@vetta-org/theme-ui/shared");

const markdownEnvironment = {
	labels: { copy: "Copy code", copied: "Copied code" },
	getFileIconClass: () => "",
	onOpenFile: () => {},
	onOpenUrl: () => {},
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

describe("SyntaxHighlightedCode", () => {
	beforeEach(() => {
		codeToHtml.mockReset();
		codeToHtml.mockImplementation(
			async (code: string, options: { theme: string }) =>
				`<pre data-highlight-theme="${options.theme}"><code>highlighted:${code}</code></pre>`,
		);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("keeps a growing Markdown tail plain, reveals it at stream pace, then flushes and highlights the final code", async () => {
		// Rendering cost must not count as stream arrival time or change the reveal budget.
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
		const darkHighlight = deferred<string>();
		const lightHighlight = deferred<string>();
		codeToHtml.mockReturnValueOnce(darkHighlight.promise).mockReturnValueOnce(lightHighlight.promise);
		const firstCode = Array.from({ length: 80 }, (_, index) => `const value${index} = ${index};`).join("\n");
		const finalLine = "console.log('complete immediately');";
		const finalCode = `${firstCode}\n${finalLine}`;
		const initial = `${"Long streamed prose. ".repeat(200)}\n\n\`\`\`ts\n${firstCode}`;
		const completed = `${initial}\n${finalLine}\n\`\`\``;
		const view = render(<MarkdownContent {...markdownEnvironment} text={initial} theme="dark" isStreamingTail />);

		expect(view.container.textContent).toContain("value79");
		expect(codeToHtml).not.toHaveBeenCalled();
		view.rerender(<MarkdownContent {...markdownEnvironment} text={completed} theme="dark" isStreamingTail />);
		expect(view.container.textContent).not.toContain(finalLine);
		expect(codeToHtml).not.toHaveBeenCalled();
		const beforeTick = view.container.textContent ?? "";
		act(() => {
			vi.advanceTimersByTime(100);
		});
		expect(view.container.textContent?.length).toBeGreaterThan(beforeTick.length);
		expect(view.container.textContent).not.toContain(finalLine);
		expect(codeToHtml).not.toHaveBeenCalled();

		view.rerender(<MarkdownContent {...markdownEnvironment} text={completed} theme="dark" isStreamingTail={false} />);
		expect(view.container.textContent).toContain(finalLine);
		expect(codeToHtml).toHaveBeenCalledTimes(1);
		expect(codeToHtml).toHaveBeenLastCalledWith(finalCode, { lang: "ts", theme: "github-dark-default" });
		await act(async () => {
			darkHighlight.resolve(
				`<pre data-highlight-theme="github-dark-default"><code>highlighted:${finalCode}</code></pre>`,
			);
		});
		expect(view.container.querySelector('[data-highlight-theme="github-dark-default"]')).not.toBeNull();

		view.rerender(
			<MarkdownContent {...markdownEnvironment} text={completed} theme="light" isStreamingTail={false} />,
		);
		expect(view.container.textContent).toContain(finalLine);
		expect(codeToHtml).toHaveBeenCalledTimes(2);
		expect(codeToHtml).toHaveBeenLastCalledWith(finalCode, { lang: "ts", theme: "github-light-default" });
		await act(async () => {
			lightHighlight.resolve(
				`<pre data-highlight-theme="github-light-default"><code>highlighted:${finalCode}</code></pre>`,
			);
		});
		expect(view.container.querySelector('[data-highlight-theme="github-light-default"]')).not.toBeNull();

		view.unmount();
		const restored = render(
			<MarkdownContent {...markdownEnvironment} text={completed} theme="light" isStreamingTail={false} />,
		);
		expect(restored.container.querySelector('[data-highlight-theme="github-light-default"]')).not.toBeNull();
		expect(codeToHtml).toHaveBeenCalledTimes(2);
	});

	it("does not start Shiki until a stable block approaches the viewport", async () => {
		let notify: IntersectionObserverCallback | undefined;
		class FakeIntersectionObserver {
			constructor(callback: IntersectionObserverCallback) {
				notify = callback;
			}
			observe() {}
			disconnect() {}
		}
		vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
		const code = "const lazyViewportCode = true;";
		render(<SyntaxHighlightedCode code={code} lang="ts" theme="dark" />);
		await Promise.resolve();
		expect(codeToHtml).not.toHaveBeenCalled();

		act(() => {
			notify?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
		});
		await waitFor(() => expect(codeToHtml).toHaveBeenCalledTimes(1));
	});

	it("deduplicates concurrent highlights for the same stable key", async () => {
		const pending = deferred<string>();
		codeToHtml.mockImplementationOnce(() => pending.promise);
		const code = "const sharedHighlightTask = true;";
		const view = render(
			<>
				<SyntaxHighlightedCode code={code} lang="ts" theme="dark" />
				<SyntaxHighlightedCode code={code} lang="ts" theme="dark" />
			</>,
		);
		await waitFor(() => expect(codeToHtml).toHaveBeenCalledTimes(1));

		await act(async () => {
			pending.resolve("<pre>shared highlighted result</pre>");
			await pending.promise;
		});
		await waitFor(() =>
			expect(view.container.textContent).toBe("shared highlighted resultshared highlighted result"),
		);
	});

	it("does not cache or render an obsolete highlight after the code changes", async () => {
		const stale = deferred<string>();
		const fresh = deferred<string>();
		codeToHtml.mockImplementationOnce(() => stale.promise).mockImplementationOnce(() => fresh.promise);
		const oldCode = "const obsoleteTask = 'old';";
		const newCode = "const obsoleteTask = 'new';";
		const view = render(<SyntaxHighlightedCode code={oldCode} lang="ts" theme="dark" />);
		await waitFor(() => expect(codeToHtml).toHaveBeenCalledTimes(1));

		view.rerender(<SyntaxHighlightedCode code={newCode} lang="ts" theme="dark" />);
		await waitFor(() => expect(codeToHtml).toHaveBeenCalledTimes(2));
		await act(async () => {
			stale.resolve("<pre>obsolete highlighted result</pre>");
			await stale.promise;
		});
		expect(view.container.textContent).toContain(newCode);
		expect(view.container.textContent).not.toContain("obsolete highlighted result");

		await act(async () => {
			fresh.resolve("<pre>fresh highlighted result</pre>");
			await fresh.promise;
		});
		await waitFor(() => expect(view.container.textContent).toBe("fresh highlighted result"));
		view.unmount();

		render(<SyntaxHighlightedCode code={oldCode} lang="ts" theme="dark" />);
		await waitFor(() => expect(codeToHtml).toHaveBeenCalledTimes(3));
	});

	it("does not populate the cache after the only consumer unmounts", async () => {
		const pending = deferred<string>();
		codeToHtml.mockImplementationOnce(() => pending.promise);
		const code = "const unmountedTask = true;";
		const view = render(<SyntaxHighlightedCode code={code} lang="ts" theme="dark" />);
		await waitFor(() => expect(codeToHtml).toHaveBeenCalledTimes(1));
		view.unmount();

		await act(async () => {
			pending.resolve("<pre>unmounted highlighted result</pre>");
			await pending.promise;
		});
		render(<SyntaxHighlightedCode code={code} lang="ts" theme="dark" />);
		await waitFor(() => expect(codeToHtml).toHaveBeenCalledTimes(2));
	});

	it("renders an oversized highlight result without retaining it in the shared cache", async () => {
		const oversizedHtml = `<pre>oversized highlighted result</pre><!--${"x".repeat(4_194_304)}-->`;
		codeToHtml.mockResolvedValue(oversizedHtml);
		const code = "const oversizedCacheEntry = true;";
		const first = render(<SyntaxHighlightedCode code={code} lang="ts" theme="dark" />);
		await waitFor(() => expect(first.container.textContent).toBe("oversized highlighted result"));
		expect(codeToHtml).toHaveBeenCalledTimes(1);
		first.unmount();

		const second = render(<SyntaxHighlightedCode code={code} lang="ts" theme="dark" />);
		await waitFor(() => expect(codeToHtml).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(second.container.textContent).toBe("oversized highlighted result"));
	});

	it("evicts old highlights once more than 300 distinct blocks are retained", async () => {
		const codes = Array.from({ length: 301 }, (_, index) => `const entryLimit${index} = true;`);
		const view = render(
			<>
				{codes.map((code) => (
					<SyntaxHighlightedCode key={code} code={code} lang="ts" theme="dark" />
				))}
			</>,
		);
		await waitFor(() => expect(view.container.querySelectorAll("[data-highlight-theme]")).toHaveLength(301));
		expect(codeToHtml).toHaveBeenCalledTimes(301);
		view.unmount();

		const recent = render(<SyntaxHighlightedCode code={codes[300]!} lang="ts" theme="dark" />);
		expect(recent.container.textContent).toBe(`highlighted:${codes[300]}`);
		expect(codeToHtml).toHaveBeenCalledTimes(301);
		recent.unmount();

		const oldest = render(<SyntaxHighlightedCode code={codes[0]!} lang="ts" theme="dark" />);
		await waitFor(() => expect(oldest.container.textContent).toBe(`highlighted:${codes[0]}`));
		expect(codeToHtml).toHaveBeenCalledTimes(302);
	});

	it("evicts older results when their combined UTF-16 size exceeds 8 MiB", async () => {
		codeToHtml.mockImplementation(async (code) => `<pre>${code}</pre><!--${"x".repeat(1_572_864)}-->`);
		const codes = ["combinedBudgetA", "combinedBudgetB", "combinedBudgetC"];
		for (const code of codes) {
			const view = render(<SyntaxHighlightedCode code={code} lang="ts" theme="dark" />);
			await waitFor(() => expect(view.container.innerHTML).toContain("<!--"));
			expect(view.container.textContent).toBe(code);
			view.unmount();
		}
		expect(codeToHtml).toHaveBeenCalledTimes(3);

		const recent = render(<SyntaxHighlightedCode code="combinedBudgetC" lang="ts" theme="dark" />);
		expect(recent.container.innerHTML).toContain("<!--");
		expect(codeToHtml).toHaveBeenCalledTimes(3);
		recent.unmount();

		const oldest = render(<SyntaxHighlightedCode code="combinedBudgetA" lang="ts" theme="dark" />);
		await waitFor(() => expect(oldest.container.innerHTML).toContain("<!--"));
		expect(oldest.container.textContent).toBe("combinedBudgetA");
		expect(codeToHtml).toHaveBeenCalledTimes(4);
	});
});
