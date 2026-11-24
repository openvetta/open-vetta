import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
import { resolveLocalFilePath } from "@shared/lib/resolve-local-file-path";
import { isSubPath, pathBasename } from "@shared/lib/utils";
import type { RendererMarkdownModel } from "@shared/models/renderer-markdown-model";
import {
	activeSessionAtom,
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	filePreviewAtom,
	openInlineFilePreviewAtom,
	openUrlInActivityWorkspaceAtom,
	resolvedThemeAtom,
} from "@shared/store/atoms";
import { showToast } from "@shared/store/toast-atoms";
import { isSshProjectUri } from "@vetta/ssh-transport/project-uri";
import { getFileIcon } from "@vetta-org/theme-ui/shared/fileIcons";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { selectAtom } from "jotai/utils";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMarkdownHost } from "./useMarkdownHost";
import { useMarkdownLabels } from "./useMarkdownLabels";

const activeCwdAtom = selectAtom(activeSessionAtom, (session) => session?.cwd ?? null);
const noActiveCwdAtom = atom(null);

/** Connects renderer state and file/url actions to the host-neutral markdown view. */
export function useRendererMarkdownModel(
	cwdOverride?: string | null,
	preferInlinePreview = true,
	workspaceIdOverride?: string,
): RendererMarkdownModel {
	const labels = useMarkdownLabels();
	const { t } = useTranslation("chat");
	const theme = useAtomValue(resolvedThemeAtom);
	const activeCwd = useAtomValue(cwdOverride === undefined ? activeCwdAtom : noActiveCwdAtom);
	const setFilePreview = useSetAtom(filePreviewAtom);
	const openInlineFilePreview = useSetAtom(openInlineFilePreviewAtom);
	const setActivityPanelOpen = useSetAtom(activityPanelOpenAtom);
	const setActivityTabByProject = useSetAtom(activityPanelTabByProjectAtom);
	const openUrlInWorkspace = useSetAtom(openUrlInActivityWorkspaceAtom);
	const narrow = useNarrowScreen();
	const cwd = cwdOverride === undefined ? activeCwd : cwdOverride;
	const workspaceId = workspaceIdOverride ?? cwd;
	const host = useMarkdownHost(cwd);

	const onOpenFile = useCallback(
		(path: string) => {
			const resolved = resolveLocalFilePath(path, cwd);
			const name = pathBasename(resolved);
			if (preferInlinePreview && !narrow && cwd && isSubPath(resolved, cwd)) {
				setActivityPanelOpen(true);
				if (workspaceId) {
					setActivityTabByProject((previous) => new Map(previous).set(workspaceId, "file"));
				}
				openInlineFilePreview({ name, path: resolved });
				return;
			}
			setFilePreview({ name, path: resolved });
		},
		[
			preferInlinePreview,
			narrow,
			cwd,
			workspaceId,
			setFilePreview,
			openInlineFilePreview,
			setActivityPanelOpen,
			setActivityTabByProject,
		],
	);
	const revealFile = useCallback(
		(path: string) => {
			const resolved = resolveLocalFilePath(path, cwd);
			// showItemInFolder 遇到不存在的路径会静默无反应，先确认文件还在。
			void window.vetta.fs
				.stat(resolved)
				.catch(() => null)
				.then((stat) => {
					if (stat) {
						void window.vetta.shell.showItemInFolder(resolved);
						return;
					}
					showToast({ variant: "warning", message: t("markdown.fileMissing", { path: resolved }) });
				});
		},
		[cwd, t],
	);
	// 远程项目里的文件在远端机器上，本机文件管理器定位不到。
	const onRevealFile = cwd && isSshProjectUri(cwd) ? undefined : revealFile;
	const onOpenUrl = useCallback(
		(url: string) => {
			if (workspaceId) openUrlInWorkspace({ workspaceId, url });
		},
		[openUrlInWorkspace, workspaceId],
	);
	const getFileIconClass = useCallback((fileName: string) => getFileIcon(fileName, false, false), []);

	return useMemo(
		() => ({
			theme: theme === "dark" ? "dark" : "light",
			labels,
			host,
			getFileIconClass,
			onOpenFile,
			onRevealFile,
			onOpenUrl,
		}),
		[theme, labels, host, getFileIconClass, onOpenFile, onRevealFile, onOpenUrl],
	);
}
