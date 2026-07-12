import type { FilePreviewContext } from "@vetta/theme-ui/file-preview";
import { FilePreviewView as ThemeFilePreviewView } from "@vetta/theme-ui/file-preview";
import { useCallback } from "react";
import { downloadItem } from "../preview-utils";
import { PreviewBody } from "./PreviewContent";
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
	return (
		<ThemeFilePreviewView
			ctx={ctx}
			labels={{
				showTree: "显示文件树",
				hideTree: "隐藏文件树",
				prev: "上一个 (←)",
				next: "下一个 (→)",
				download: "下载",
				refresh: "刷新",
				close: "关闭",
			}}
			onPrev={onPrev}
			onNext={onNext}
			onClose={onClose}
			canPrev={canPrev}
			canNext={canNext}
			enableKeyboard={enableKeyboard}
			onToggleSidebar={onToggleSidebar}
			sidebarCollapsed={sidebarCollapsed}
			onDownload={(item) => void downloadItem(item)}
			renderBody={(item, refreshNonce) => (
				<PreviewErrorBoundary resetKey={item}>
					<PreviewBody item={item} refreshNonce={refreshNonce} />
				</PreviewErrorBoundary>
			)}
		/>
	);
}

/**
 * Hook 返回标准的 prev/next/close 导航回调，绑定到一个可写的预览上下文 atom。
 */
export function usePreviewNav(
	setCtx: (
		ctx:
			| FilePreviewContext
			| null
			| ((prev: FilePreviewContext | null) => FilePreviewContext | null),
	) => void,
): {
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
