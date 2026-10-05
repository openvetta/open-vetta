// @vitest-environment jsdom
import { fileTreeCacheAtom } from "@shared/store/atoms";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useFileTree } from "./useFileTree";

const readDir = vi.fn(async () => []);
beforeEach(() => {
	readDir.mockClear();
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: { fs: { readDir, watchDir: vi.fn(), unwatchDir: vi.fn(), onDirChanged: () => () => {} } },
	});
});
it("rejects a retained reveal callback from an earlier workspace before performing any read", async () => {
	const store = createStore();
	const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
	const hook = renderHook(({ cwd }) => useFileTree(cwd), { wrapper, initialProps: { cwd: "/old" } });
	await waitFor(() => expect(store.get(fileTreeCacheAtom).has("/old")).toBe(true));
	const oldReveal = hook.result.current.revealPath;
	hook.rerender({ cwd: "/new" });
	await waitFor(() => expect(store.get(fileTreeCacheAtom).has("/new")).toBe(true));
	readDir.mockClear();
	await act(async () => {
		await expect(oldReveal("/old/src/file.ts")).rejects.toThrow("superseded");
	});
	expect(readDir).not.toHaveBeenCalled();
	expect([...store.get(fileTreeCacheAtom).keys()]).toEqual(["/new"]);
});
