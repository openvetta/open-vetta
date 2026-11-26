import type { UpdaterState } from "@preload/api";
import { updaterStateAtom } from "@shared/store/atoms";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { resolveAppLanguageFromLocale } from "../../../shared/i18n/config";
import { splitReleaseNotesByVersion, stripReleaseNoteHeader } from "../../../shared/release-note-header";
import { selectReleaseNoteLanguage } from "../../../shared/release-note-language";

/**
 * 挂在 RootLayout：拉一次主进程当前 UpdaterState，并订阅状态变化。
 * 更新就绪只通过侧边栏底部的提示项告知，不自动弹全局对话框。
 */
export function useUpdaterInit(): void {
	const setState = useSetAtom(updaterStateAtom);
	const { i18n } = useTranslation();

	useEffect(() => {
		let cancelled = false;
		void window.vetta.updater.getState().then((s) => {
			if (cancelled) return;
			setState(s);
		});

		const unsubscribe = window.vetta.updater.onStateChanged(setState);
		const disposePreview = import.meta.env.DEV
			? installDevUpdatePreview(setState, () => resolveAppLanguageFromLocale(i18n.language))
			: undefined;

		return () => {
			cancelled = true;
			unsubscribe();
			disposePreview?.();
		};
	}, [setState, i18n]);
}

/**
 * 仅开发期：在控制台执行 `__previewUpdate()`，用当前版本的发布说明模拟「更新已就绪」，
 * 用来查看侧栏更新图标与更新对话框；`__previewUpdate(5)` 模拟跨 5 个版本更新（取仓库里
 * 不高于当前版本的最近 5 份说明）；`__previewUpdate(false)` 还原。生产构建不含此段。
 */
function installDevUpdatePreview(setState: (state: UpdaterState) => void, language: () => "zh" | "en"): () => void {
	const target = window as unknown as { __previewUpdate?: (on?: boolean | number) => Promise<void> };
	target.__previewUpdate = async (on = true) => {
		const state = await window.vetta.updater.getState();
		if (on === false) return setState(state);
		const count = typeof on === "number" ? Math.max(1, Math.floor(on)) : 1;
		const notes = import.meta.glob("../../../../../../.github/release-notes/*.md", {
			query: "?raw",
			import: "default",
		}) as Record<string, () => Promise<string>>;
		const versions = Object.keys(notes)
			.map((path) => ({ path, version: /v(\d+\.\d+\.\d+)\.md$/.exec(path)?.[1] }))
			.filter((item): item is { path: string; version: string } => Boolean(item.version))
			.filter((item) => compareVersions(item.version, state.currentVersion) <= 0)
			.sort((a, b) => compareVersions(b.version, a.version))
			.slice(0, count);
		const notesByVersion = splitReleaseNotesByVersion(
			await Promise.all(
				versions.map(async (item) => ({
					version: item.version,
					note: stripReleaseNoteHeader(selectReleaseNoteLanguage(await notes[item.path](), language())),
				})),
			),
		);
		setState({ ...state, phase: "ready", latestVersion: state.currentVersion, ...notesByVersion });
	};
	return () => {
		delete target.__previewUpdate;
	};
}

function compareVersions(a: string, b: string): number {
	const pa = a.split(".").map(Number);
	const pb = b.split(".").map(Number);
	for (let i = 0; i < 3; i += 1) {
		const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}
