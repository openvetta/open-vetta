// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectInstructions } from "./useProjectInstructions";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

const readFile = vi.fn<(path: string) => Promise<{ content: string; encoding: "utf8" }>>();
const writeFile = vi.fn<(path: string, content: string) => Promise<void>>();

beforeEach(() => {
	readFile.mockReset().mockResolvedValue({ content: "Original instructions", encoding: "utf8" });
	writeFile.mockReset().mockResolvedValue(undefined);
	vi.stubGlobal("vetta", { fs: { readFile, writeFile } });
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("project instructions lifecycle", () => {
	it("blocks edits and writes after a failed read until a retry loads the existing content", async () => {
		readFile.mockRejectedValueOnce(new Error("File too large to preview (>10 MB)"));
		const { result } = renderHook(() => useProjectInstructions("/projects/one"));
		await waitFor(() => expect(result.current.loadError).toBe(true));
		act(() => result.current.setContent("Accidental replacement"));
		await act(async () => result.current.save());
		expect(result.current.content).toBe("");
		expect(writeFile).not.toHaveBeenCalled();
		act(() => result.current.reload());
		await waitFor(() => expect(result.current.content).toBe("Original instructions"));
		expect(result.current.loadError).toBe(false);
		act(() => result.current.setContent("Intended edit"));
		await act(async () => result.current.save());
		expect(writeFile).toHaveBeenCalledWith("/projects/one/AGENTS.md", "Intended edit");
	});

	it("allows creating instructions when the host reports a missing file as a successful empty read", async () => {
		readFile.mockResolvedValueOnce({ content: "", encoding: "utf8" });
		const { result } = renderHook(() => useProjectInstructions("/projects/one"));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.loadError).toBe(false);
		act(() => result.current.setContent("New instructions"));
		await act(async () => result.current.save());
		expect(writeFile).toHaveBeenCalledWith("/projects/one/AGENTS.md", "New instructions");
	});

	it("ignores a failed read from a project the user has already left", async () => {
		const first = deferred<{ content: string; encoding: "utf8" }>();
		readFile.mockReturnValueOnce(first.promise);
		const { result, rerender } = renderHook(({ cwd }) => useProjectInstructions(cwd), {
			initialProps: { cwd: "/projects/one" },
		});
		rerender({ cwd: "/projects/two" });
		await waitFor(() => expect(result.current.content).toBe("Original instructions"));
		await act(async () => first.reject(new Error("Previous project unavailable")));
		expect(result.current.loadError).toBe(false);
		expect(result.current.content).toBe("Original instructions");
	});

	it("loads, edits and saves the active project, preserving edits made during save", async () => {
		const write = deferred<void>();
		writeFile.mockReturnValueOnce(write.promise);
		const { result } = renderHook(() => useProjectInstructions("/projects/one"));
		expect(result.current.loading).toBe(true);
		await waitFor(() => expect(result.current.content).toBe("Original instructions"));
		act(() => result.current.setContent("First edit"));
		expect(result.current.isDirty).toBe(true);
		let save!: Promise<void>;
		act(() => {
			save = result.current.save();
		});
		expect(result.current.saveStatus).toBe("saving");
		act(() => result.current.setContent("Newer edit"));
		await act(async () => {
			write.resolve();
			await save;
		});
		expect(writeFile).toHaveBeenCalledWith("/projects/one/AGENTS.md", "First edit");
		expect(result.current.content).toBe("Newer edit");
		expect(result.current.isDirty).toBe(true);
		expect(result.current.saveStatus).toBe("idle");
		await act(async () => result.current.save());
		expect(writeFile).toHaveBeenLastCalledWith("/projects/one/AGENTS.md", "Newer edit");
		expect(result.current.isDirty).toBe(false);
		expect(result.current.saveStatus).toBe("saved");
	});

	it("ignores a previous project's late read after navigating to another project", async () => {
		const first = deferred<{ content: string; encoding: "utf8" }>();
		const second = deferred<{ content: string; encoding: "utf8" }>();
		readFile.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		const { result, rerender } = renderHook(({ cwd }) => useProjectInstructions(cwd), {
			initialProps: { cwd: "/projects/one" },
		});
		rerender({ cwd: "/projects/two" });
		await act(async () => first.resolve({ content: "Wrong project's instructions", encoding: "utf8" }));
		expect(result.current.loading).toBe(true);
		expect(result.current.content).toBe("");
		await act(async () => second.resolve({ content: "Second project", encoding: "utf8" }));
		expect(result.current.content).toBe("Second project");
		expect(result.current.isDirty).toBe(false);
	});

	it("does not let a previous save change the new project's draft or saved status", async () => {
		const write = deferred<void>();
		writeFile.mockReturnValueOnce(write.promise);
		const { result, rerender } = renderHook(({ cwd }) => useProjectInstructions(cwd), {
			initialProps: { cwd: "/projects/one" },
		});
		await waitFor(() => expect(result.current.loading).toBe(false));
		act(() => result.current.setContent("First project edit"));
		let save!: Promise<void>;
		act(() => {
			save = result.current.save();
		});
		rerender({ cwd: "/projects/two" });
		await waitFor(() => expect(result.current.loading).toBe(false));
		act(() => result.current.setContent("Second project edit"));
		await act(async () => {
			write.resolve();
			await save;
		});
		expect(result.current.content).toBe("Second project edit");
		expect(result.current.saveStatus).toBe("idle");
		expect(result.current.isDirty).toBe(true);
	});

	it("preserves a failed save for retry and coalesces repeated save actions", async () => {
		const write = deferred<void>();
		writeFile.mockReturnValueOnce(write.promise);
		const { result } = renderHook(() => useProjectInstructions("/projects/one"));
		await waitFor(() => expect(result.current.loading).toBe(false));
		act(() => result.current.setContent("Keep this draft"));
		let first!: Promise<void>;
		await act(async () => {
			first = result.current.save();
			await result.current.save();
		});
		expect(writeFile).toHaveBeenCalledTimes(1);
		await act(async () => {
			write.reject(new Error("disk unavailable"));
			await first;
		});
		expect(result.current.saveStatus).toBe("error");
		expect(result.current.content).toBe("Keep this draft");
		expect(result.current.isDirty).toBe(true);
		await act(async () => result.current.save());
		expect(result.current.saveStatus).toBe("saved");
		expect(result.current.isDirty).toBe(false);
	});
});
