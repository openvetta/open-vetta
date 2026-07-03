import { useParams } from "@tanstack/react-router";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityPanel } from "@domains/activity-panel/components/ActivityPanel";
import { Button } from "@shared/components/ui/button";
import { cn } from "@shared/lib/utils";
import { useThemeSurface } from "@vetta/theme-sdk/appearance";
import {
	activityPanelOpenAtom,
	defaultImConversationCwdAtom,
	closeInlineFilePreviewAtom,
	inlineFilePreviewContextReadonlyAtom,
	knowledgeProcessingCwdAtom,
	pageHeaderRightSlotAtom,
} from "@shared/store/atoms";
import { fullHistoryToChat } from "../services/chat-service";
import type { ChatMessage } from "@shared/store/atoms";
import { ChatExportHost } from "./ChatExportHost";
import { MessageList } from "./MessageList";

/**
 * Read-only viewer for sessions the desktop app does not own (currently
 * IM sessions written by im-gateway). Reads the .jsonl directly, tails
 * fs.watch for new entries, and renders messages using the same MessageList
 * component as the live chat — but with NO input bar, NO abort, NO write
 * actions. This sidesteps the single-writer lockfile that would otherwise
 * block opening a session currently held by the sidecar.
 *
 * 来源判定：path 落在 im-gateway cwd 下（[[isImSession]] 的等价物，但只有 path 可用），
 * 就视为 IM 会话并显示「实时更新」徽标；否则按只读视图处理。
 *
 * 活动面板：右上角保留 toggle 按钮，ActivityPanel 以 imCwd 渲染。imCwd 没 meta.json
 * → useProjectProfile 走默认 normal 分支 → 只会展示「文件」tab，正好用来看 Claw 项目
 * 的产物（落在 imCwd 根下，跟 .vetta/sessions 同级）。
 *
 * Route param `path` is URI-encoded absolute session-file path.
 */

/**
 * 判断 filePath 是否位于 dir 目录之下，分隔符无关（Windows 上 session path 用反斜杠、
 * 手动拼 `dir + "/"` 前缀会因 `\` vs `/` 匹配失败，导致 KB/IM 面板判定为 false）。
 */
function isPathUnderDir(filePath: string, dir: string): boolean {
	if (!filePath || !dir) return false;
	const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
	return `${norm(filePath)}/`.startsWith(`${norm(dir)}/`);
}

export function SessionViewerPage(): JSX.Element {
	const { t } = useTranslation("chat");
	const surface = useThemeSurface("chat.sessionViewerPage");
	// biome-ignore lint/suspicious/noExplicitAny: route params typing
	const params = useParams({ strict: false }) as any;
	const encodedPath = params.path as string | undefined;
	const path = encodedPath ? decodeURIComponent(encodedPath) : "";

	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [exporting, setExporting] = useState(false);
	const setHeaderRight = useSetAtom(pageHeaderRightSlotAtom);
	const imCwd = useAtomValue(defaultImConversationCwdAtom);
	const kbCwd = useAtomValue(knowledgeProcessingCwdAtom);
	const [panelOpen, setPanelOpen] = useAtom(activityPanelOpenAtom);
	const inlinePreviewCtx = useAtomValue(inlineFilePreviewContextReadonlyAtom);
	const inlinePreviewActive = inlinePreviewCtx !== null;
	const closeInlinePreview = useSetAtom(closeInlineFilePreviewAtom);
	const isIm = useMemo(() => isPathUnderDir(path, imCwd), [path, imCwd]);
	const exportTitle = useMemo(() => {
		const fileName = path.split(/[\\/]/).at(-1) ?? t("sessionViewer.export.defaultTitle");
		return fileName.replace(/\.jsonl$/i, "");
	}, [path, t]);
	const handleExportFinished = useCallback(() => setExporting(false), []);
	const isKnowledge = useMemo(() => isPathUnderDir(path, kbCwd), [path, kbCwd]);

	const handleTogglePanel = useCallback(() => {
		// 跟 ChatView 对齐：inline preview 打开时，关面板按钮也要顺手关掉 preview，
		// 否则它仍然以 flex-1 占着主区域。
		if (inlinePreviewActive) {
			closeInlinePreview();
			setPanelOpen(false);
			return;
		}
		setPanelOpen((o) => !o);
	}, [inlinePreviewActive, closeInlinePreview, setPanelOpen]);

	useEffect(() => {
		const badgeLabel = isIm ? t("sessionViewer.badge.liveUpdate") : t("sessionViewer.badge.readOnly");
		const badgeClass = isIm
			? "rounded bg-primary/15 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-primary"
			: "rounded bg-muted/60 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";
		setHeaderRight(
			<div className="flex items-center gap-2 text-[12px] text-muted-foreground">
				<span className="hidden truncate sm:inline">{t("sessionViewer.header.subtitle")}</span>
				<span className={badgeClass}>{badgeLabel}</span>
				<Button
					size="icon-xs"
					variant="ghost"
					title={t("sessionViewer.exportButton.title")}
					disabled={messages.length === 0 || exporting}
					onClick={() => setExporting(true)}
				>
					<span
						className={
							exporting
								? "icon-[mdi--loading] animate-spin text-[14px]"
								: "icon-[mdi--language-html5] text-[14px]"
						}
					/>
				</Button>
				<Button
					size="icon-xs"
					variant="ghost"
					title={panelOpen ? t("sessionViewer.panelToggleButton.titleClose") : t("sessionViewer.panelToggleButton.titleOpen")}
					onClick={handleTogglePanel}
					className={panelOpen ? "bg-accent text-foreground" : ""}
				>
					<span className="icon-[solar--sidebar-minimalistic-linear] -scale-x-100 text-[14px]" />
				</Button>
			</div>,
		);
		return () => setHeaderRight(null);
	}, [isIm, panelOpen, handleTogglePanel, setHeaderRight, messages.length, exporting]);

	useEffect(() => {
		if (!path) return;
		let cancelled = false;
		let unsubscribe: (() => void) | undefined;

		(async () => {
			try {
				const initial = await window.vetta.session.openViewer(path);
				if (cancelled) return;
				setMessages(fullHistoryToChat(initial.history));

				unsubscribe = await window.vetta.session.subscribeViewer(path, (snapshot) => {
					setMessages(fullHistoryToChat(snapshot.history));
				});
				if (cancelled) unsubscribe?.();
			} catch (err) {
				if (!cancelled) setError((err as Error).message);
			}
		})();

		return () => {
			cancelled = true;
			unsubscribe?.();
		};
	}, [path]);

	if (!path) {
		return (
			<div className="flex h-full min-h-0 flex-1 items-center justify-center text-[13px] text-muted-foreground">
				{t("sessionViewer.emptyState.noPath")}
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex h-full min-h-0 flex-1 items-center justify-center p-8 text-[13px] text-destructive">
				加载失败：{error}
			</div>
		);
	}

	return (
		<div className={cn("flex h-full min-w-0 flex-1 flex-col bg-background", surface?.rootClassName)}>
			{exporting && (
				<ChatExportHost
					messages={messages}
					title={exportTitle}
					onFinished={handleExportFinished}
				/>
			)}
			<div className="flex min-h-0 flex-1 gap-2 overflow-visible">
				<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
					<MessageList messages={messages} isStreaming={false} sessionId={null} />
				</div>
				{isKnowledge ? (
					<ActivityPanel cwd={kbCwd || null} enablePluginTabs={false} knowledgeHistory />
				) : (
					<ActivityPanel cwd={imCwd || null} enablePluginTabs={false} />
				)}
			</div>
		</div>
	);
}
