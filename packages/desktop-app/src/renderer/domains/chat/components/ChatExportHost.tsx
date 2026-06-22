import type { ChatMessage } from "@shared/store/atoms";
import { useEffect, useRef } from "react";
import { buildChatHtmlDocument } from "../services/chat-html-export";
import { ExportMessageList } from "./MessageList";

interface ChatExportHostProps {
	messages: ChatMessage[];
	title: string;
	onFinished: () => void;
}

function nextPaint(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
	});
}

function safeFileName(value: string): string {
	const normalized = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
	return `${normalized || "Vetta 会话"}.html`;
}

export function ChatExportHost({ messages, title, onFinished }: ChatExportHostProps): JSX.Element {
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				await document.fonts.ready;
				await nextPaint();
				const root = rootRef.current;
				if (!root || cancelled) return;
				const html = await buildChatHtmlDocument(root, title);
				if (cancelled) return;
				await window.vetta.dialog.saveHtml(safeFileName(title), html);
			} catch (error) {
				console.error("[ChatExport] export failed", error);
				if (!cancelled) {
					alert(error instanceof Error ? `导出失败：${error.message}` : "导出失败");
				}
			} finally {
				if (!cancelled) onFinished();
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [onFinished, title]);

	return (
		<div aria-hidden="true" className="fixed left-[-100000px] top-0 w-[768px] bg-background">
			<ExportMessageList ref={rootRef} messages={messages} />
		</div>
	);
}
