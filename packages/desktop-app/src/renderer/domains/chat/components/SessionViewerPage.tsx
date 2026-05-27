import { useParams } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { pageHeaderRightSlotAtom } from "@shared/store/atoms";
import { fullHistoryToChat } from "../services/chat-service";
import type { ChatMessage } from "../services/chat-service";
import { MessageList } from "./MessageList";

/**
 * Read-only viewer for sessions the desktop app does not own (currently
 * IM-origin sessions written by im-gateway). Reads the .jsonl directly,
 * tails fs.watch for new entries, and renders messages using the same
 * MessageList component as the live chat — but with NO input bar, NO
 * abort, NO write actions. This sidesteps the single-writer lockfile
 * that would otherwise block opening a session currently held by the
 * sidecar.
 *
 * Route param `path` is URI-encoded absolute session-file path.
 */
export function SessionViewerPage(): JSX.Element {
	// biome-ignore lint/suspicious/noExplicitAny: route params typing
	const params = useParams({ strict: false }) as any;
	const encodedPath = params.path as string | undefined;
	const path = encodedPath ? decodeURIComponent(encodedPath) : "";

	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [origin, setOrigin] = useState<"im" | "desktop" | undefined>();
	const [error, setError] = useState<string | null>(null);
	const setHeaderRight = useSetAtom(pageHeaderRightSlotAtom);

	useEffect(() => {
		if (!origin) {
			setHeaderRight(null);
			return;
		}
		const badgeLabel = origin === "im" ? "实时更新" : "只读视图";
		const badgeClass =
			origin === "im"
				? "rounded bg-primary/15 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-primary"
				: "rounded bg-muted/60 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";
		setHeaderRight(
			<div className="flex items-center gap-2 text-[12px] text-muted-foreground">
				<span className="hidden truncate sm:inline">该会话由其他端写入，桌面端仅展示</span>
				<span className={badgeClass}>{badgeLabel}</span>
			</div>,
		);
		return () => setHeaderRight(null);
	}, [origin, setHeaderRight]);

	useEffect(() => {
		if (!path) return;
		let cancelled = false;
		let unsubscribe: (() => void) | undefined;

		(async () => {
			try {
				const initial = await window.vetta.session.openViewer(path);
				if (cancelled) return;
				setMessages(fullHistoryToChat(initial.history));
				setOrigin(initial.origin);

				unsubscribe = await window.vetta.session.subscribeViewer(path, (snapshot) => {
					setMessages(fullHistoryToChat(snapshot.history));
					setOrigin(snapshot.origin);
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
		<div className="relative flex h-full min-h-0 flex-1 flex-col">
			<div className="flex min-h-0 flex-1 flex-col">
				<MessageList messages={messages} isStreaming={false} sessionId={null} />
			</div>
		</div>
	);
}
