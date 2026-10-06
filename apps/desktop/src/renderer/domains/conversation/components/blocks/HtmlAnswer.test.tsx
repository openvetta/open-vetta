// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { defaultMarkdown, extendMarkdown, MarkdownContent, MarkdownProvider } from "@vetta-org/theme-ui/markdown";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const labels = {
	copy: "Copy HTML",
	copied: "Copied HTML",
	html: {
		title: "HTML answer",
		preview: "Preview",
		source: "Source",
		expand: "Taller answer",
		collapse: "Compact answer",
		waiting: "Generating",
		incomplete: "Unfinished HTML",
		tooLarge: "Too large",
		safety: "Offline; scripts disabled",
		copyFailed: "Copy failed",
	},
};
const environment = {
	theme: "light" as const,
	labels,
	getFileIconClass: () => "",
	onOpenFile: vi.fn(),
	onOpenUrl: vi.fn(),
};
const source =
	"<!doctype html><html><head><style>body{margin:0}</style></head><body><h1>Report</h1><details><summary>Evidence</summary>Detail</details></body></html>";
const fence = (html = source, language = "html-preview") => `\`\`\`${language}\n${html}\n\`\`\``;
beforeEach(() => {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: { writeText: vi.fn(async () => undefined) },
	});
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});
describe("inline HTML answers", () => {
	it("retains one document while viewing source, copying, changing theme, and reopening", async () => {
		const view = render(<MarkdownContent {...environment} text={fence()} />);
		const frame = screen.getByTitle("HTML answer");
		fireEvent.click(screen.getByRole("button", { name: "Source" }));
		expect(frame.closest("[hidden]")).not.toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Copy HTML" }));
		await screen.findByRole("button", { name: "Copied HTML" });
		expect(navigator.clipboard.writeText).toHaveBeenCalledWith(source);
		fireEvent.click(screen.getByRole("button", { name: "Preview" }));
		fireEvent.click(screen.getByRole("button", { name: "Taller answer" }));
		view.rerender(<MarkdownContent {...environment} theme="dark" text={fence()} />);
		expect(screen.getByTitle("HTML answer")).toBe(frame);
		expect(view.container.querySelectorAll("iframe")).toHaveLength(1);
		expect(screen.getByRole("button", { name: "Compact answer" }).getAttribute("aria-expanded")).toBe("true");
		view.unmount();
		expect(frame.isConnected).toBe(false);
		render(<MarkdownContent {...environment} text={fence()} />);
		expect(screen.getByTitle("HTML answer").getAttribute("srcdoc")).toContain("Report");
	});
	it("keeps ordinary HTML source-first, including after regeneration", () => {
		vi.useFakeTimers();
		const view = render(<MarkdownContent {...environment} text={fence(source, "html")} />);
		expect(view.container.querySelector("iframe")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Preview" }));
		expect(view.container.querySelector("iframe")).not.toBeNull();
		const next = fence("<h1>Replacement</h1>", "html");
		view.rerender(<MarkdownContent {...environment} text={next} isStreamingTail />);
		act(() => vi.advanceTimersByTime(5000));
		view.rerender(<MarkdownContent {...environment} text={next} isStreamingTail={false} />);
		expect(view.container.querySelector("iframe")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Preview" }));
		expect(screen.getByTitle("HTML answer").getAttribute("srcdoc")).toContain("Replacement");
	});
	it("waits for final streaming content and does not remount on later settling", () => {
		vi.useFakeTimers();
		const view = render(<MarkdownContent {...environment} text={`\`\`\`html-preview\n<h1>Draft`} isStreamingTail />);
		act(() => vi.advanceTimersByTime(5000));
		expect(view.container.querySelector("iframe")).toBeNull();
		const complete = `${fence()}\n\nFinal explanation`;
		view.rerender(<MarkdownContent {...environment} text={complete} isStreamingTail />);
		act(() => vi.advanceTimersByTime(5000));
		expect(view.container.querySelector("iframe")).toBeNull();
		view.rerender(<MarkdownContent {...environment} text={complete} isStreamingTail={false} />);
		const frame = screen.getByTitle("HTML answer");
		act(() => vi.advanceTimersByTime(5000));
		expect(screen.getByTitle("HTML answer")).toBe(frame);
	});
	it("leaves incomplete and oversized HTML inspectable without preview", () => {
		const view = render(<MarkdownContent {...environment} text={"```html-preview\n<h1>Interrupted"} />);
		expect(screen.getByText("Unfinished HTML")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Preview" }).hasAttribute("disabled")).toBe(true);
		fireEvent.click(screen.getByRole("button", { name: "Source" }));
		expect(view.container.querySelector("iframe")).toBeNull();
		view.rerender(<MarkdownContent {...environment} text={fence("x".repeat(512 * 1024 + 1))} />);
		expect(screen.getByText("Too large")).toBeTruthy();
		expect(view.container.querySelector("iframe")).toBeNull();
	});
	it("does not accept resize messages or leave content mounted after conversation changes", () => {
		const view = render(<MarkdownContent {...environment} text={fence()} />);
		const frame = screen.getByTitle("HTML answer") as HTMLIFrameElement;
		const viewport = frame.parentElement?.closest("div[style]");
		const style = viewport?.getAttribute("style");
		expect(style).toContain("height:");
		act(() =>
			window.dispatchEvent(
				new MessageEvent("message", { source: frame.contentWindow, data: { type: "resize", height: 100000000 } }),
			),
		);
		expect(viewport?.getAttribute("style")).toBe(style);
		view.rerender(<MarkdownContent {...environment} text="Another conversation" />);
		expect(frame.isConnected).toBe(false);
	});
	it("keeps custom Markdown extensions, ordinary code, and raw HTML inert", () => {
		const definition = extendMarkdown(defaultMarkdown, {
			codeBlock: ({ code }) => (
				<section aria-label="Custom code">
					<pre>{code}</pre>
				</section>
			),
		});
		const view = render(
			<MarkdownProvider definition={definition}>
				<MarkdownContent {...environment} text={fence()} />
			</MarkdownProvider>,
		);
		expect(screen.getByLabelText("Custom code").textContent).toBe(source);
		expect(view.container.querySelector("iframe")).toBeNull();
		view.rerender(
			<MarkdownContent
				{...environment}
				text={`<iframe src="https://preview.invalid"></iframe>\n${fence("let x = 1", "js")}`}
			/>,
		);
		expect(view.container.querySelector("iframe")).toBeNull();
		expect(screen.queryByRole("button", { name: "Preview" })).toBeNull();
	});
	it.each([
		["~~~HTML-PREVIEW\n<h1>Ready</h1>\n~~~", true],
		["````html-preview\n<h1>Ready</h1>\n````", true],
		["```html-preview\r\n<h1>Ready</h1>\r\n```", true],
		["````html-preview\n<h1>Not ready</h1>\n```", false],
		["```html-preview\n<h1>Not ready</h1>\n~~~", false],
		["```html-preview\n<h1>Not ready</h1>\n``` extra", false],
	])("requires actual fence closure for %s", (text, ready) => {
		const view = render(<MarkdownContent {...environment} text={text} />);
		expect(!!view.container.querySelector("iframe")).toBe(ready);
	});
	it("reports clipboard failures and allows retry", async () => {
		vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("denied"));
		render(<MarkdownContent {...environment} text={fence()} />);
		fireEvent.click(screen.getByRole("button", { name: "Copy HTML" }));
		await screen.findByRole("alert");
		fireEvent.click(screen.getByRole("button", { name: "Copy HTML" }));
		await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
	});
	it("ignores an old copy completion after source changes", async () => {
		let finish: (() => void) | undefined;
		vi.mocked(navigator.clipboard.writeText).mockReturnValueOnce(
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
		);
		const view = render(<MarkdownContent {...environment} text={fence()} />);
		fireEvent.click(screen.getByRole("button", { name: "Copy HTML" }));
		view.rerender(<MarkdownContent {...environment} text={fence("<h1>New</h1>")} />);
		await act(async () => finish?.());
		expect(screen.queryByRole("button", { name: "Copied HTML" })).toBeNull();
	});
	it("keeps an empty completed HTML fence empty rather than rendering undefined", () => {
		const view = render(<MarkdownContent {...environment} text={fence("")} />);
		expect(view.container.querySelector("iframe")).toBeNull();
		expect(view.container.textContent).not.toContain("undefined");
		fireEvent.click(screen.getByRole("button", { name: "Source" }));
		expect(view.container.textContent).not.toContain("undefined");
	});
});
