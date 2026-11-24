// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("shiki", () => ({ codeToHtml: vi.fn(async () => "<pre></pre>") }));
vi.mock("../../activity-panel/components/previews/MarkdownPreview", () => ({
	MarkdownPreview: () => <div data-testid="markdown" />,
}));

import { EditableTextFileView } from "./EditableTextFileView";
import { RENDERED_PREVIEW_SIZE_LIMIT } from "./TextPreviewRenderer";

function mockFile(content: string): void {
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: {
			fs: {
				readEditableTextFile: vi.fn(async () => ({
					content,
					revision: "r1",
					hasBom: false,
					lineEnding: "lf",
					size: content.length,
					modifiedAt: 1,
				})),
				watchDir: vi.fn(async () => undefined),
				unwatchDir: vi.fn(async () => undefined),
				onDirChanged: vi.fn(() => () => {}),
			},
		},
	});
}

async function open(name: string): Promise<void> {
	render(
		<Provider store={createStore()}>
			<EditableTextFileView item={{ name, path: `/repo/${name}` }} refreshNonce={0} />
		</Provider>,
	);
	await act(async () => {});
}

describe("EditableTextFileView", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("opens a normal Markdown file on its rendered preview", async () => {
		mockFile("# Title\n");
		await open("README.md");
		expect(screen.getByTestId("markdown")).toBeTruthy();
	});

	it("opens a huge Markdown file on its source and still renders it when asked", async () => {
		mockFile(`# Title\n${"text ".repeat(RENDERED_PREVIEW_SIZE_LIMIT / 5)}`);
		await open("CHANGELOG.md");
		expect(screen.queryByTestId("markdown")).toBeNull();

		fireEvent.click(screen.getByText("fileEditor.preview"));
		expect(screen.getByTestId("markdown")).toBeTruthy();
	});
});
