// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { describe, expect, it, vi } from "vitest";

const shiki = vi.hoisted(() => ({ codeToHtml: vi.fn(async () => "<pre>highlighted</pre>") }));
vi.mock("shiki", () => shiki);
vi.mock("../../activity-panel/components/previews/MarkdownPreview", () => ({
	MarkdownPreview: ({ content }: { content: string }) => <div data-testid="markdown">{content.length}</div>,
}));

import { RENDERED_PREVIEW_SIZE_LIMIT, TextPreviewRenderer } from "./TextPreviewRenderer";

function renderPreview(props: Parameters<typeof TextPreviewRenderer>[0]) {
	return render(
		<Provider store={createStore()}>
			<TextPreviewRenderer {...props} />
		</Provider>,
	);
}

const huge = "const value = 1;\n".repeat(Math.ceil((RENDERED_PREVIEW_SIZE_LIMIT + 1) / 17));

describe("TextPreviewRenderer", () => {
	it("shows huge sources in the virtualized editor instead of highlighting them whole", async () => {
		const { container } = renderPreview({ content: huge, extension: "ts" });
		expect(container.querySelector(".cm-editor")).not.toBeNull();
		await act(async () => {});
		expect(screen.queryByText("highlighted")).toBeNull();
	});

	it("highlights small sources", async () => {
		renderPreview({ content: "const a = 1;", extension: "ts" });
		expect(await screen.findByText("highlighted")).toBeTruthy();
	});

	it("shows huge Markdown as source unless the user asked for the rendered view", () => {
		const content = `# Title\n${"text ".repeat(RENDERED_PREVIEW_SIZE_LIMIT / 5)}`;
		const source = renderPreview({ content, extension: "md" });
		expect(source.queryByTestId("markdown")).toBeNull();
		expect(source.container.querySelector(".cm-editor")).not.toBeNull();
		source.unmount();

		const rendered = renderPreview({ content, extension: "md", renderLargeDocuments: true });
		expect(rendered.getByTestId("markdown")).toBeTruthy();
	});
});
