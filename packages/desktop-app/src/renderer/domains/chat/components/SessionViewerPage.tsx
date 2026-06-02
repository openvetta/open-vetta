import { useParams } from "@tanstack/react-router";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityPanel } from "@domains/activity-panel/components/ActivityPanel";
import { Button } from "@shared/components/ui/button";
import {
	activityPanelOpenAtom,
	defaultImConversationCwdAtom,
	inlineFilePreviewAtom,
	inlineFilePreviewContextReadonlyAtom,
	pageHeaderRightSlotAtom,
} from "@shared/store/atoms";
import { fullHistoryToChat } from "../services/chat-service";
import type { ChatMessage } from "@shared/store/atoms";
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
export function SessionViewerPage(): JSX.Element {
	// biome-ignore lint/suspicious/noExplicitAny: route params typing
	const params = useParams({ strict: false }) as any;
	const encodedPath = params.path as string | undefined;
	const path = encodedPath ? decodeURIComponent(encodedPath) : "";

	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [error, setError] = useState<string | null>(null);
	const setHeaderRight = useSetAtom(pageHeaderRightSlotAtom);
	const imCwd = useAtomValue(defaultImConversationCwdAtom);
	const [panelOpen, setPanelOpen] = useAtom(activityPanelOpenAtom);
	const inlinePreviewCtx = useAtomValue(inlineFilePreviewContextReadonlyAtom);
	const inlinePreviewActive = inlinePreviewCtx !== null;
	const setInlinePreview = useSetAtom(inlineFilePreviewAtom);
	const isIm = useMemo(() => {
		if (!path || !imCwd) return false;
		const prefix = imCwd.endsWith("/") ? imCwd : `${imCwd}/`;
		return path.startsWith(prefix);
	}, [path, imCwd]);

	const handleTogglePanel = useCallback(() => {
		// 跟 ChatView 对齐：inline preview 打开时，关面板按钮也要顺手关掉 preview，
		// 否则它仍然以 flex-1 占着主区域。
		if (inlinePreviewActive) {
			setInlinePreview(null);
			setPanelOpen(false);
			return;
		}
		setPanelOpen((o) => !o);
	}, [inlinePreviewActive, setInlinePreview, setPanelOpen]);

	useEffect(() => {
		const badgeLabel = isIm ? "实时更新" : "只读视图";
		const badgeClass = isIm
			? "rounded bg-primary/15 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-primary"
			: "rounded bg-muted/60 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";
		setHeaderRight(
			<div className="flex items-center gap-2 text-[12px] text-muted-foreground">
				<span className="hidden truncate sm:inline">该会话由其他端写入，桌面端仅展示</span>
				<span className={badgeClass}>{badgeLabel}</span>
				<Button
					size="icon-xs"
					variant="ghost"
					title={panelOpen ? "关闭活动面板" : "打开活动面板"}
					onClick={handleTogglePanel}
					className={panelOpen ? "bg-accent text-foreground" : ""}
				>
					<span className="icon-[mdi--dock-right] text-[14px]" />
				</Button>
			</div>,
		);
		return () => setHeaderRight(null);
	}, [isIm, panelOpen, handleTogglePanel, setHeaderRight]);

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
				未指定会话路径
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
		<div className="flex h-full min-w-0 flex-1 flex-col bg-background">
			<div className="flex flex-1 gap-2 overflow-hidden">
				<div
					className={
						inlinePreviewActive
							? "flex w-[360px] shrink-0 flex-col transition-[width] duration-200"
							: "flex min-w-0 flex-1 flex-col"
					}
				>
					<MessageList messages={messages} isStreaming={false} sessionId={null} />
				</div>
				<ActivityPanel cwd={imCwd || null} />
			</div>
		</div>
	);
}
