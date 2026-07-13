import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
import {
	activeSessionAtom,
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	filePreviewAtom,
	openInlineFilePreviewAtom,
	openUrlInBrowserAtom,
	resolvedThemeAtom,
} from "@shared/store/atoms";
import type { TextBlockViewProps } from "@vetta/theme-ui/chat";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getFileIcon } from "../../file-explorer/components/fileIcons";

/** 判断绝对路径 target 是否落在目录 dir 内（含 dir 本身）。 */
function isPathWithinDir(dir: string, target: string): boolean {
	const stripTrailing = (p: string): string => p.replace(/\/+$/, "");
	const d = stripTrailing(dir);
	return target === d || target.startsWith(`${d}/`);
}

export type TextBlockModel = Omit<TextBlockViewProps, "text" | "isStreamingTail" | "className">;

export function useTextBlockModel(): TextBlockModel {
	const { t } = useTranslation("chat");
	const theme = useAtomValue(resolvedThemeAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const setFilePreview = useSetAtom(filePreviewAtom);
	const openInlineFilePreview = useSetAtom(openInlineFilePreviewAtom);
	const setActivityPanelOpen = useSetAtom(activityPanelOpenAtom);
	const setActivityTabByProject = useSetAtom(activityPanelTabByProjectAtom);
	const openUrlInBrowser = useSetAtom(openUrlInBrowserAtom);
	const narrow = useNarrowScreen();
	const cwd = activeSession?.cwd ?? null;

	const onOpenFile = useCallback(
		(path: string) => {
			const name = path.split("/").pop() || path;
			if (!narrow && cwd && isPathWithinDir(cwd, path)) {
				setActivityPanelOpen(true);
				setActivityTabByProject((prev) => new Map(prev).set(cwd, "file"));
				openInlineFilePreview({ name, path });
				return;
			}
			setFilePreview({ name, path });
		},
		[narrow, cwd, setFilePreview, openInlineFilePreview, setActivityPanelOpen, setActivityTabByProject],
	);

	const onOpenUrl = useCallback(
		(url: string) => {
			openUrlInBrowser(url);
		},
		[openUrlInBrowser],
	);

	const getFileIconClass = useCallback((fileName: string) => getFileIcon(fileName, false, false), []);

	// labels 必须引用稳定：每次 render 新建对象会让 TextBlockView 的 components
	// useMemo 失效，ReactMarkdown 把 p/a/code 等自定义节点当新型别整树 remount，
	// .streaming-chunk 的 fade 动画在每个 delta 重播 → text block 高频闪烁。
	const labels = useMemo(
		() => ({
			copy: t("copyButton.label"),
			copied: t("copyButton.copied"),
		}),
		[t],
	);

	return {
		theme: theme === "dark" ? "dark" : "light",
		labels,
		getFileIconClass,
		onOpenFile,
		onOpenUrl,
	};
}
