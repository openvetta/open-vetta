// @vitest-environment jsdom

import { Toaster } from "@shared/components/ui/Toaster";
import { i18n, initI18n } from "@shared/i18n";
import { copyFilePathsToClipboard } from "@shared/lib/file-path-clipboard";
import { filePreviewAtom } from "@shared/store/atoms";
import { dismissToast, toastsAtom } from "@shared/store/toast-atoms";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FilePreviewContext, FilePreviewItem } from "@vetta-org/theme-ui/file-preview";
import { getDefaultStore } from "jotai";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilePreviewDialog } from "./FilePreviewDialog";
import { FilePreviewView, usePreviewNav } from "./FilePreviewView";

function InlinePreview({ items }: { items: FilePreviewItem[] }): JSX.Element | null {
	const [context, setContext] = useState<FilePreviewContext | null>({ items, index: 0 });
	const { goPrev, goNext, close } = usePreviewNav(setContext);
	if (!context) return null;
	return (
		<FilePreviewView
			ctx={context}
			onPrev={goPrev}
			onNext={goNext}
			onClose={close}
			canPrev={context.index > 0}
			canNext={context.index < context.items.length - 1}
		/>
	);
}

const localPaths = [
	"/workspace/my project/报告 #100%.custom",
	"C:\\workspace\\my project\\报告 #100%.custom",
	"\\\\server\\share\\my project\\report.custom",
];
const remotePath = "ssh://production-2/srv/my project/报告 #100%.custom";
const remoteLabel = "Copy remote location (including SSH host)";
const store = getDefaultStore();

describe("file preview copy path controls", () => {
	let writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;
	let showItemInFolder: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		writeText = vi.fn(async () => undefined);
		showItemInFolder = vi.fn(async () => undefined);
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: {
				fs: {
					readTextPreviewFile: vi.fn(async () => ({ status: "binary", size: 4 })),
					watchDir: vi.fn(async () => undefined),
					unwatchDir: vi.fn(async () => undefined),
					onDirChanged: vi.fn(() => () => undefined),
				},
				shell: { showItemInFolder },
			},
		});
		initI18n();
		await i18n.changeLanguage("en");
	});

	afterEach(() => {
		act(() => {
			store.set(filePreviewAtom, null);
			for (const toast of store.get(toastsAtom)) dismissToast(toast.id);
		});
	});

	it("copies the current inline file across navigation without changing native paths or SSH identity", async () => {
		const user = userEvent.setup({ writeToClipboard: false });
		// user-event installs its own browser clipboard stub; this is the only clipboard boundary.
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
		const paths = [...localPaths, remotePath];
		render(
			<>
				<InlinePreview
					items={[
						...paths.map((path, index) => ({ name: `file-${index}.custom`, path })),
						{ name: "attachment.custom", url: "https://example.test/attachment.custom" },
					]}
				/>
				<Toaster />
			</>,
		);
		const closeButton = screen.getByRole("button", { name: "Close" });

		for (const [index, path] of paths.entries()) {
			const name = index === 3 ? remoteLabel : "Copy absolute path";
			const button = screen.getByRole("button", { name });
			expect(button.textContent).toContain(index === 3 ? "Copy remote location" : "Copy path");
			await user.click(button);
			await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(path));
			expect((await screen.findAllByText("File path copied")).length).toBeGreaterThan(0);
			await user.click(screen.getByRole("button", { name: "Next (→)" }));
		}

		expect(screen.queryByRole("button", { name: "Copy absolute path" })).toBeNull();
		expect(screen.queryByRole("button", { name: remoteLabel })).toBeNull();
		await user.click(screen.getByRole("button", { name: "Previous (←)" }));
		await user.click(screen.getByRole("button", { name: remoteLabel }));
		expect(writeText).toHaveBeenLastCalledWith(remotePath);
		await user.click(closeButton);
		expect(screen.queryByRole("button", { name: remoteLabel })).toBeNull();
	});

	it("reports clipboard failure and permits retry in the dialog without closing it", async () => {
		const user = userEvent.setup({ writeToClipboard: false });
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
		writeText.mockRejectedValueOnce(new Error("Clipboard denied"));
		store.set(filePreviewAtom, { name: "report.custom", path: localPaths[0] });
		render(
			<>
				<FilePreviewDialog />
				<Toaster />
			</>,
		);

		await user.click(screen.getByRole("button", { name: "Copy absolute path" }));
		expect(await screen.findByText("Could not copy the file path. Please try again.")).toBeTruthy();
		expect(screen.queryByText("File path copied")).toBeNull();
		expect(store.get(filePreviewAtom)?.path).toBe(localPaths[0]);

		await user.click(screen.getByRole("button", { name: "Copy absolute path" }));
		expect(await screen.findByText("File path copied")).toBeTruthy();
		expect(writeText).toHaveBeenLastCalledWith(localPaths[0]);
		await user.click(screen.getByRole("button", { name: "Show in Folder" }));
		expect(showItemInFolder).toHaveBeenCalledWith(localPaths[0]);
	});

	it("uses translated remote-location controls and never sends SSH URIs to the local file manager", async () => {
		await i18n.changeLanguage("zh");
		const user = userEvent.setup({ writeToClipboard: false });
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
		store.set(filePreviewAtom, { name: "report.custom", path: remotePath });
		render(
			<>
				<FilePreviewDialog />
				<Toaster />
			</>,
		);

		expect(screen.queryByRole("button", { name: i18n.t("common:filePreview.showInFolder") })).toBeNull();
		await user.click(screen.getByRole("button", { name: "复制远程位置（含 SSH 主机）" }));
		expect(writeText).toHaveBeenCalledWith(remotePath);
		expect(await screen.findByText("文件路径已复制")).toBeTruthy();
		expect(showItemInFolder).not.toHaveBeenCalled();
		expect(store.get(filePreviewAtom)?.path).toBe(remotePath);

		act(() => store.set(filePreviewAtom, { name: "attachment.custom", url: "https://example.test/a.custom" }));
		expect(screen.queryByRole("button", { name: "复制远程位置（含 SSH 主机）" })).toBeNull();
		expect(screen.queryByRole("button", { name: "复制绝对路径" })).toBeNull();
	});

	it("waits for clipboard completion before reporting success", async () => {
		const user = userEvent.setup({ writeToClipboard: false });
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
		let completeCopy = () => {};
		writeText.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					completeCopy = resolve;
				}),
		);
		render(
			<>
				<InlinePreview items={[{ name: "report.custom", path: localPaths[0] }]} />
				<Toaster />
			</>,
		);

		await user.click(screen.getByRole("button", { name: "Copy absolute path" }));
		expect(writeText).toHaveBeenCalledWith(localPaths[0]);
		expect(screen.queryByText("File path copied")).toBeNull();
		await act(async () => completeCopy());
		expect(await screen.findByText("File path copied")).toBeTruthy();
	});

	it("handles an unavailable clipboard and shares multi-path feedback with the explorer", async () => {
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
		expect(await copyFilePathsToClipboard([localPaths[0]])).toBe(false);
		expect(store.get(toastsAtom).at(-1)).toMatchObject({
			variant: "error",
			message: "Could not copy the file path. Please try again.",
		});

		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
		expect(await copyFilePathsToClipboard([...localPaths, remotePath])).toBe(true);
		expect(writeText).toHaveBeenCalledWith([...localPaths, remotePath].join("\n"));
		expect(store.get(toastsAtom).at(-1)?.variant).toBe("success");
	});
	it("keeps the dialog open for preview content and closes only its explicit control or backdrop", async () => {
		const user = userEvent.setup();
		store.set(filePreviewAtom, { name: "report.custom", path: localPaths[0] });
		render(<FilePreviewDialog />);
		const dialog = screen.getByRole("dialog", { name: "report.custom" });
		await user.click(screen.getByText("report.custom"));
		expect(store.get(filePreviewAtom)?.path).toBe(localPaths[0]);
		await user.click(dialog);
		expect(store.get(filePreviewAtom)).toBeNull();
	});
});
