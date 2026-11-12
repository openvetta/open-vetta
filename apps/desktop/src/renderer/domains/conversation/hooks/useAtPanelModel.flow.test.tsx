// @vitest-environment jsdom

import { initI18n } from "@shared/i18n";
import { isMac } from "@shared/lib/platform";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAtPanelModel } from "./useAtPanelModel";

initI18n();

const cwd = "/workspace/demo";

function installFs() {
	const readDir = vi.fn(async (dir: string) => {
		if (dir === `${cwd}/src`) {
			return [{ name: "a.ts", path: `${cwd}/src/a.ts`, isDirectory: false, size: 1, modifiedAt: 0 }];
		}
		return [
			{ name: "src", path: `${cwd}/src`, isDirectory: true, size: 0, modifiedAt: 0 },
			{ name: "README.md", path: `${cwd}/README.md`, isDirectory: false, size: 1, modifiedAt: 0 },
		];
	});
	const listFilesRecursive = vi.fn(async () => [
		{ name: "src", path: `${cwd}/src`, relPath: "src", isDirectory: true },
		{ name: "a.ts", path: `${cwd}/src/a.ts`, relPath: "src/a.ts" },
	]);
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: { fs: { readDir, listFilesRecursive } },
	});
	return { readDir, listFilesRecursive };
}

describe("useAtPanelModel directory citation", () => {
	let fs: ReturnType<typeof installFs>;

	beforeEach(() => {
		fs = installFs();
	});

	async function openPanel() {
		const onSelect = vi.fn();
		const onClose = vi.fn();
		const rendered = renderHook(
			(props: { filter: string }) =>
				useAtPanelModel({
					open: true,
					onClose,
					onSelect,
					filter: props.filter,
					cwd,
				}),
			{ initialProps: { filter: "" } },
		);
		await waitFor(() => {
			expect(rendered.result.current.viewProps.entries.some((entry) => entry.name === "src")).toBe(true);
		});
		return { ...rendered, onSelect, onClose };
	}

	it("浏览时点击目录是进入，引用按钮才把目录交给输入框", async () => {
		const { result, onSelect } = await openPanel();
		const directory = result.current.viewProps.entries.find((entry) => entry.name === "src");
		expect(directory?.isDirectory).toBe(true);

		act(() => {
			result.current.viewProps.onCiteDirectory?.(directory!);
		});
		expect(onSelect).toHaveBeenCalledWith({ path: `${cwd}/src`, name: "src", isDirectory: true });

		act(() => {
			result.current.viewProps.onEntryClick(directory!);
		});
		await waitFor(() => {
			expect(fs.readDir).toHaveBeenCalledWith(`${cwd}/src`);
		});
		expect(onSelect).toHaveBeenCalledTimes(1);

		act(() => {
			document.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Enter", metaKey: isMac, ctrlKey: !isMac, bubbles: true, cancelable: true }),
			);
		});
		expect(onSelect).toHaveBeenCalledTimes(1);
	});

	it("当前行是目录时，mod+enter 引用它", async () => {
		const { result, onSelect } = await openPanel();
		act(() => {
			document.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Enter", metaKey: isMac, ctrlKey: !isMac, bubbles: true, cancelable: true }),
			);
		});
		expect(onSelect).toHaveBeenCalledWith({ path: `${cwd}/src`, name: "src", isDirectory: true });
		expect(result.current.viewProps.entries[0]?.name).toBe("src");
	});

	it("搜索结果里的目录点一下就引用，并且列举时要求包含目录", async () => {
		const { result, rerender, onSelect } = await openPanel();
		rerender({ filter: "@src" });

		await waitFor(() => {
			expect(result.current.viewProps.entries.some((entry) => entry.relPath === "src")).toBe(true);
		});
		const directory = result.current.viewProps.entries.find((entry) => entry.relPath === "src");
		expect(directory?.isDirectory).toBe(true);

		act(() => {
			result.current.viewProps.onEntryClick(directory!);
		});
		expect(onSelect).toHaveBeenCalledWith({ path: `${cwd}/src`, name: "src", isDirectory: true });
		expect(fs.listFilesRecursive).toHaveBeenCalledWith(cwd, { includeDirectories: true });
		expect(fs.readDir).not.toHaveBeenCalledWith(`${cwd}/src`);
	});
});
