import { useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

	const badgeLabel = origin === "im" ? "IM 实时只读" : "只读视图";

	return (
		<div className="relative flex h-full min-h-0 flex-1 flex-col">
			<div className="flex shrink-0 items-center gap-2 border-b border-border/40 bg-muted/30 px-4 py-2 text-[12px] text-muted-foreground">
				<span
					className={
						origin === "im"
							? "rounded bg-emerald-500/15 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400"
							: "rounded bg-muted/60 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
					}
				>
					{badgeLabel}
				</span>
				<span className="truncate">该会话由其他端写入，桌面端仅展示，无法发送消息</span>
			</div>
			<div className="flex min-h-0 flex-1 flex-col">
				<MessageList messages={messages} isStreaming={false} sessionId={null} />
			</div>
		</div>
	);
}
