import { cn } from "@shared/lib/utils";
import {
	type FilePreviewContext,
	type FilePreviewItem,
	resolvedThemeAtom,
} from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PreviewErrorBoundary } from "./PreviewErrorBoundary";
import { CodePreview } from "../../activity-panel/components/previews/CodePreview";
import { DocxPreview } from "../../activity-panel/components/previews/DocxPreview";
import { HtmlPreview } from "../../activity-panel/components/previews/HtmlPreview";
import { ImagePreview } from "../../activity-panel/components/previews/ImagePreview";
import { MarkdownPreview } from "../../activity-panel/components/previews/MarkdownPreview";
import { PdfPreview } from "../../activity-panel/components/previews/PdfPreview";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"]);
const MARKDOWN_EXTENSIONS = new Set(["md", "mdx"]);

const TEXT_EXTENSIONS = new Set([
	"md", "mdx",
	"ts", "tsx", "js", "jsx", "mjs", "cjs",
	"json", "yaml", "yml", "toml", "xml", "html", "htm", "css", "scss", "less",
	"py", "go", "rs", "java", "kt", "swift", "rb", "php", "c", "cpp", "h", "cs",
	"sh", "bash", "zsh", "sql", "graphql", "gql", "lua", "r", "dart",
	"env", "lock", "ini", "cfg", "conf", "log", "txt",
	"dockerfile", "makefile",
]);

const SUPPORTED_EXTENSIONS = new Set<string>([
	...IMAGE_EXTENSIONS,
	"pdf", "docx",
	...TEXT_EXTENSIONS,
]);

export function getExtension(name: string): string {
	const dotIdx = name.lastIndexOf(".");
	if (dotIdx <= 0) return "";
	return name.substring(dotIdx + 1).toLowerCase();
}

export function isPreviewSupported(name: string): boolean {
	return SUPPORTED_EXTENSIONS.has(getExtension(name));
}

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
				onPrev={canNavigate ? onPrev : undefined}
				onNext={canNavigate ? onNext : undefined}
				position={canNavigate ? `${index + 1} / ${total}` : undefined}
				canPrev={canNavigate && canPrev}
				canNext={canNavigate && canNext}
				onToggleSidebar={onToggleSidebar}
				sidebarCollapsed={sidebarCollapsed}
			/>
			<PreviewErrorBoundary resetKey={item}>
				<PreviewBody item={item} />
			</PreviewErrorBoundary>
		</div>
	);
}

function Header({
	item,
	onClose,
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
				<HeaderButton icon="icon-[mdi--download]" title="下载" onClick={() => downloadItem(item)} />
			)}
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

type LoadState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "loaded"; content: string; encoding: "utf8" | "base64" };

function PreviewBody({ item }: { item: FilePreviewItem }): JSX.Element {
	const ext = useMemo(() => getExtension(item.name), [item.name]);
	const supported = isPreviewSupported(item.name);
	const theme = useAtomValue(resolvedThemeAtom);

	const [state, setState] = useState<LoadState>({ status: "loading" });

	useEffect(() => {
		if (!supported) return;
		let cancelled = false;
		setState({ status: "loading" });

		void loadItem(item, ext)
			.then((result) => {
				if (!cancelled) setState({ status: "loaded", ...result });
			})
			.catch((err: Error) => {
				if (!cancelled) {
					const message = err.message?.includes("too large")
						? "文件过大，无法预览"
						: "无法读取此文件";
					setState({ status: "error", message });
				}
			});

		return () => {
			cancelled = true;
		};
	}, [item, ext, supported]);

	if (!supported) return <UnsupportedDetail item={item} />;

	if (state.status === "loading") {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center p-8">
				<span className="icon-[mdi--loading] animate-spin text-[24px] text-muted-foreground/50" />
			</div>
		);
	}

	if (state.status === "error") {
		return (
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-muted-foreground/50">
				<span className="icon-[mdi--alert-circle-outline] text-[40px]" />
				<span className="text-[13px]">{state.message}</span>
			</div>
		);
	}

	if (IMAGE_EXTENSIONS.has(ext)) {
		return (
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<ImagePreview content={state.content} extension={ext} />
			</div>
		);
	}
	if (ext === "pdf") {
		return (
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<PdfPreview content={state.content} />
			</div>
		);
	}
	if ((ext === "html" || ext === "htm") && state.encoding === "utf8") {
		return <HtmlPreview content={state.content} extension={ext} theme={theme} />;
	}

	const scrollWrap = "min-h-0 flex-1 overflow-y-auto";
	if (ext === "docx") {
		return (
			<div className={scrollWrap}>
				<DocxPreview content={state.content} />
			</div>
		);
	}
	if (MARKDOWN_EXTENSIONS.has(ext)) {
		return (
			<div className={scrollWrap}>
				<MarkdownPreview content={state.content} />
			</div>
		);
	}

	if (ext === "json" && state.encoding === "utf8") {
		let formatted = state.content;
		try {
			formatted = JSON.stringify(JSON.parse(state.content), null, 2);
		} catch {
			// keep original
		}
		return (
			<div className={scrollWrap}>
				<CodePreview content={formatted} extension={ext} theme={theme} />
			</div>
		);
	}

	return (
		<div className={scrollWrap}>
			<CodePreview content={state.content} extension={ext} theme={theme} />
		</div>
	);
}

function UnsupportedDetail({ item }: { item: FilePreviewItem }): JSX.Element {
	const ext = getExtension(item.name);
	const downloadable = !!item.url;

	return (
		<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 py-12">
			<div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-muted">
				<span className="icon-[mdi--file-outline] h-10 w-10 text-muted-foreground/60" />
			</div>
			<div className="text-center">
				<p className="max-w-md break-all text-[14px] font-semibold text-foreground">{item.name}</p>
				{ext && (
					<p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
						{ext}
					</p>
				)}
				<p className="mt-2 text-[11px] text-muted-foreground/60">暂不支持预览此文件格式</p>
			</div>
			{downloadable && (
				<button
					type="button"
					onClick={() => downloadItem(item)}
					className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-[12.5px] font-medium text-primary-foreground shadow-md transition-all duration-200 hover:scale-105 hover:bg-primary/90"
				>
					<span className="icon-[mdi--download] h-4 w-4" />
					下载文件
				</button>
			)}
		</div>
	);
}

async function loadItem(
	item: FilePreviewItem,
	ext: string,
): Promise<{ content: string; encoding: "utf8" | "base64" }> {
	if (item.path) {
		return await window.vetta.fs.readFile(item.path);
	}
	if (!item.url) {
		throw new Error("无可用数据源");
	}
	const res = await fetch(item.url);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);

	if (TEXT_EXTENSIONS.has(ext)) {
		const text = await res.text();
		return { content: text, encoding: "utf8" };
	}
	const buf = await res.arrayBuffer();
	return { content: arrayBufferToBase64(buf), encoding: "base64" };
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

function downloadItem(item: FilePreviewItem): void {
	if (!item.url) return;
	void window.vetta.downloads.start({ url: item.url, filename: item.name });
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
