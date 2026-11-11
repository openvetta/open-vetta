import type { UpdaterState } from "@preload/api";
import { updaterStateAtom } from "@shared/store/atoms";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { stripReleaseNoteHeader } from "../../../shared/release-note-header";

/**
 * 挂在 RootLayout：拉一次主进程当前 UpdaterState，并订阅状态变化。
 * 更新就绪只通过侧边栏底部的提示项告知，不自动弹全局对话框。
 */
export function useUpdaterInit(): void {
	const setState = useSetAtom(updaterStateAtom);

	useEffect(() => {
		let cancelled = false;
		void window.vetta.updater.getState().then((s) => {
			if (cancelled) return;
			setState(s);
		});

		const unsubscribe = window.vetta.updater.onStateChanged(setState);
		const disposePreview = import.meta.env.DEV ? installDevUpdatePreview(setState) : undefined;

		return () => {
			cancelled = true;
			unsubscribe();
			disposePreview?.();
		};
	}, [setState]);
}

/**
 * 仅开发期：在控制台执行 `__previewUpdate()`，用当前版本的发布说明模拟「更新已就绪」，
 * 用来查看侧栏更新图标与更新对话框；`__previewUpdate(false)` 还原。生产构建不含此段。
 */
function installDevUpdatePreview(setState: (state: UpdaterState) => void): () => void {
	const target = window as unknown as { __previewUpdate?: (on?: boolean) => Promise<void> };
	target.__previewUpdate = async (on = true) => {
		const state = await window.vetta.updater.getState();
		if (!on) return setState(state);
		const notes = import.meta.glob("../../../../../../.github/release-notes/*.md", {
			query: "?raw",
			import: "default",
		}) as Record<string, () => Promise<string>>;
		const entry = Object.entries(notes).find(([path]) => path.endsWith(`v${state.currentVersion}.md`));
		const releaseNote = entry ? stripReleaseNoteHeader(await entry[1]()) : undefined;
		setState({ ...state, phase: "ready", latestVersion: state.currentVersion, releaseNote });
	};
	return () => {
		delete target.__previewUpdate;
	};
}
