import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@shared/lib/utils";

export function formatTime(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString("zh-CN", {
		hour12: false,
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function formatRelativeTime(timestamp: number, now: number): string | null {
	const diffMinutes = Math.floor((now - timestamp) / 60000);
	if (diffMinutes < 5) return null;
	if (diffMinutes < 60) return `${diffMinutes}分钟前`;
	if (diffMinutes < 120) {
		const minutes = diffMinutes % 60;
		return minutes > 0 ? `1小时${minutes}分钟前` : "1小时前";
	}
	if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}小时前`;
	return `${Math.floor(diffMinutes / 1440)}天前`;
}

export function formatDuration(seconds: number): string {
	if (seconds < 60) return `${Math.round(seconds)}秒`;
	return `${Math.floor(seconds / 60)}分${Math.round(seconds % 60)}秒`;
}

export function RelativeTimeLabel({ endedAt }: { endedAt: number }): JSX.Element | null {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 30000);
		return () => window.clearInterval(timer);
	}, []);
	const label = formatRelativeTime(endedAt, now);
	if (!label) return null;
	return (
		<span className="text-[11px] text-muted-foreground/40" title={formatTime(endedAt)}>
			{label}
		</span>
	);
}

export function CopyButton({ getText }: { getText: () => string }): JSX.Element {
	const { t } = useTranslation("chat");
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timerRef.current !== null) window.clearTimeout(timerRef.current);
		},
		[],
	);

	const onClick = useCallback(() => {
		const text = getText();
		if (!text) return;
		void navigator.clipboard.writeText(text).then(
			() => {
				setCopied(true);
				if (timerRef.current !== null) window.clearTimeout(timerRef.current);
				timerRef.current = window.setTimeout(() => {
					setCopied(false);
					timerRef.current = null;
				}, 1500);
			},
			(error) => {
				console.warn("[MessageActions] copy failed", error);
			},
		);
	}, [getText]);

	const label = copied
		? t("messageList.copyButton.copied")
		: t("messageList.copyButton.copy");
	return (
		<button
			type="button"
			onClick={onClick}
			title={label}
			aria-label={label}
			className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground/45 transition-colors hover:bg-muted/60 hover:text-foreground"
		>
			<span
				className={cn(
					"h-3.5 w-3.5",
					copied ? "icon-[mdi--check]" : "icon-[mdi--content-copy]",
				)}
			/>
		</button>
	);
}
