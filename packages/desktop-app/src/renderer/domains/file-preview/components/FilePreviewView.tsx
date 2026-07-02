import { cn } from "@shared/lib/utils";
import type { FilePreviewContext, FilePreviewItem } from "@shared/store/atoms";
import { useCallback, useEffect, useState } from "react";
import { PreviewBody, downloadItem } from "./PreviewContent";
import { PreviewErrorBoundary } from "./PreviewErrorBoundary";

interface FilePreviewViewProps {
	ctx: FilePreviewContext;
	onPrev?: () => void;
	onNext?: () => void;
	onClose: () => void;
	canPrev: boolean;
	canNext: boolean;
	enableKeyboard?: boolean;
	onToggleSidebar?: () => void;
	sidebarCollapsed?: boolean;
}

export function FilePreviewView({
	ctx,
	onPrev,
	onNext,
	onClose,
	canPrev,
	canNext,
	enableKeyboard = false,
	onToggleSidebar,
	sidebarCollapsed,
}: FilePreviewViewProps): JSX.Element | null {
	const total = ctx.items.length;
	const index = ctx.index;
	const item = ctx.items[index] ?? null;
	// 手动刷新计数：递增即触发预览重读 / 重挂载
	const [refreshNonce, setRefreshNonce] = useState(0);
	const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

	useEffect(() => {
		if (!enableKeyboard) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
				return;
			}
			if (e.key === "ArrowLeft") {
				e.preventDefault();
				onPrev?.();
			} else if (e.key === "ArrowRight") {
				e.preventDefault();
				onNext?.();
			} else if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [enableKeyboard, onPrev, onNext, onClose]);

	if (!item) return null;
	const canNavigate = total > 1;

	return (
		<div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
			<Header
				item={item}
				onClose={onClose}
				onRefresh={refresh}
				onPrev={canNavigate ? onPrev : undefined}
				onNext={canNavigate ? onNext : undefined}
				position={canNavigate ? `${index + 1} / ${total}` : undefined}
				canPrev={canNavigate && canPrev}
				canNext={canNavigate && canNext}
				onToggleSidebar={onToggleSidebar}
				sidebarCollapsed={sidebarCollapsed}
			/>
			<PreviewErrorBoundary resetKey={item}>
				<PreviewBody item={item} refreshNonce={refreshNonce} />
			</PreviewErrorBoundary>
		</div>
	);
}

function Header({
	item,
	onClose,
	onRefresh,
	onPrev,
	onNext,
	position,
	canPrev,
	canNext,
	onToggleSidebar,
	sidebarCollapsed,
}: {
	item: FilePreviewItem;
	onClose: () => void;
	onRefresh: () => void;
	onPrev?: () => void;
	onNext?: () => void;
	position?: string;
	canPrev: boolean;
	canNext: boolean;
	onToggleSidebar?: () => void;
	sidebarCollapsed?: boolean;
}): JSX.Element {
	const downloadable = !!item.url;
	return (
		<div className="flex shrink-0 items-center gap-1.5 border-b border-border/40 py-1.5 pl-2 pr-3">
			{onToggleSidebar && (
				<HeaderButton
					icon="icon-[mdi--dock-left]"
					title={sidebarCollapsed ? "显示文件树" : "隐藏文件树"}
					onClick={onToggleSidebar}
				/>
			)}
			<h2 className="-ml-0.5 min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
				{item.name}
			</h2>
			{position && (
				<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
					{position}
				</span>
			)}
			{onPrev && (
				<HeaderButton icon="icon-[mdi--chevron-left]" title="上一个 (←)" onClick={onPrev} disabled={!canPrev} />
			)}
			{onNext && (
				<HeaderButton icon="icon-[mdi--chevron-right]" title="下一个 (→)" onClick={onNext} disabled={!canNext} />
			)}
			{downloadable && (
				<HeaderButton icon="icon-[mdi--download]" title="下载" onClick={() => void downloadItem(item)} />
			)}
			<HeaderButton icon="icon-[mdi--refresh]" title="刷新" onClick={onRefresh} />
			<HeaderButton icon="icon-[mdi--close]" title="关闭" onClick={onClose} />
		</div>
	);
}

function HeaderButton({
	icon,
	title,
	onClick,
	disabled,
}: {
	icon: string;
	title: string;
	onClick: () => void;
	disabled?: boolean;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={onClick}
			title={title}
			disabled={disabled}
			className={cn(
				"flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors",
				disabled
					? "text-muted-foreground/30"
					: "text-muted-foreground/70 hover:bg-muted hover:text-foreground",
			)}
		>
			<span className={cn(icon, "h-4 w-4")} />
		</button>
	);
}

/**
 * Hook 返回标准的 prev/next/close 导航回调，绑定到一个可写的预览上下文 atom。
 */
export function usePreviewNav(setCtx: (ctx: FilePreviewContext | null | ((prev: FilePreviewContext | null) => FilePreviewContext | null)) => void): {
	goPrev: () => void;
	goNext: () => void;
	close: () => void;
} {
	const goPrev = useCallback(() => {
		setCtx((prev) => {
			if (!prev || prev.items.length <= 1) return prev;
			const next = prev.index - 1;
			return next < 0 ? prev : { ...prev, index: next };
		});
	}, [setCtx]);
	const goNext = useCallback(() => {
		setCtx((prev) => {
			if (!prev || prev.items.length <= 1) return prev;
			const next = prev.index + 1;
			return next >= prev.items.length ? prev : { ...prev, index: next };
		});
	}, [setCtx]);
	const close = useCallback(() => setCtx(null), [setCtx]);
	return { goPrev, goNext, close };
}
