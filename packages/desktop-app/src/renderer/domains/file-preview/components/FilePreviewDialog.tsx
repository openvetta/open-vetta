import { Dialog, DialogContent } from "@shared/components/ui/dialog";
import { cn } from "@shared/lib/utils";
import {
	type FilePreviewItem,
	filePreviewContextReadonlyAtom,
	resolvedThemeAtom,
} from "@shared/store/atoms";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CodePreview } from "../../activity-panel/components/previews/CodePreview";
import { DocxPreview } from "../../activity-panel/components/previews/DocxPreview";
import { ImagePreview } from "../../activity-panel/components/previews/ImagePreview";
import { MarkdownPreview } from "../../activity-panel/components/previews/MarkdownPreview";
import { PdfPreview } from "../../activity-panel/components/previews/PdfPreview";

// ============================================================================
// Extension dispatch tables
// ============================================================================

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"]);
const MARKDOWN_EXTENSIONS = new Set(["md", "mdx"]);

/** 文本类扩展（fetch URL 时按 utf8 读取，否则按 base64 读取） */
const TEXT_EXTENSIONS = new Set([
	"md", "mdx",
	"ts", "tsx", "js", "jsx", "mjs", "cjs",
	"json", "yaml", "yml", "toml", "xml", "html", "css", "scss", "less",
	"py", "go", "rs", "java", "kt", "swift", "rb", "php", "c", "cpp", "h", "cs",
	"sh", "bash", "zsh", "sql", "graphql", "gql", "lua", "r", "dart",
	"env", "lock", "ini", "cfg", "conf", "log", "txt",
	"dockerfile", "makefile",
]);

/** 全部支持预览的扩展 */
const SUPPORTED_EXTENSIONS = new Set<string>([
	...IMAGE_EXTENSIONS,
	"pdf", "docx",
	...TEXT_EXTENSIONS,
]);

function getExtension(name: string): string {
	const dotIdx = name.lastIndexOf(".");
	if (dotIdx <= 0) return "";
	return name.substring(dotIdx + 1).toLowerCase();
}

function isSupported(name: string): boolean {
	return SUPPORTED_EXTENSIONS.has(getExtension(name));
}

// ============================================================================
// Dialog
// ============================================================================

export function FilePreviewDialog(): JSX.Element {
	const [ctx, setCtx] = useAtom(filePreviewContextReadonlyAtom);
	const open = ctx !== null;
	const close = useCallback(() => setCtx(null), [setCtx]);

	const total = ctx?.items.length ?? 0;
	const index = ctx?.index ?? 0;
	const item = ctx ? (ctx.items[index] ?? null) : null;

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

	// 键盘 ←/→ 切换
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
				return;
			}
			if (e.key === "ArrowLeft") {
				e.preventDefault();
				goPrev();
			} else if (e.key === "ArrowRight") {
				e.preventDefault();
				goNext();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, goPrev, goNext]);

	const canNavigate = total > 1;

	return (
		<Dialog open={open} onOpenChange={(o) => !o && close()}>
			<DialogContent
				showCloseButton={false}
				className="flex h-[85vh] w-[min(90vw,900px)] flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-background/95 p-0 backdrop-blur-xl sm:max-w-[900px]"
			>
				{item && (
					<>
						<Header
							item={item}
							onClose={close}
							onPrev={canNavigate ? goPrev : undefined}
							onNext={canNavigate ? goNext : undefined}
							position={canNavigate ? `${index + 1} / ${total}` : undefined}
							canPrev={canNavigate && index > 0}
							canNext={canNavigate && index < total - 1}
						/>
						<PreviewBody item={item} />
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

// ============================================================================
// Header
// ============================================================================

function Header({
	item,
	onClose,
	onPrev,
	onNext,
	position,
	canPrev,
	canNext,
}: {
	item: FilePreviewItem;
	onClose: () => void;
	onPrev?: () => void;
	onNext?: () => void;
	position?: string;
	canPrev: boolean;
	canNext: boolean;
}): JSX.Element {
	const downloadable = !!item.url;
	return (
		<div className="flex items-center gap-2 border-b border-border/40 px-4 py-2.5">
			<h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
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

// ============================================================================
// Preview body
// ============================================================================

type LoadState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "loaded"; content: string; encoding: "utf8" | "base64" };

function PreviewBody({ item }: { item: FilePreviewItem }): JSX.Element {
	const ext = useMemo(() => getExtension(item.name), [item.name]);
	const supported = isSupported(item.name);
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

	if (!supported) {
		return <UnsupportedDetail item={item} />;
	}

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

	// 图片 / PDF：自带 ZoomableView，需要 flex 父容器
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

	// 文本/富文本类：滚动容器
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

	// JSON 美化
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

	// 其他文本：syntax highlight
	return (
		<div className={scrollWrap}>
			<CodePreview content={state.content} extension={ext} theme={theme} />
		</div>
	);
}

// ============================================================================
// Unsupported → 居中 detail + 下载（原版样式）
// ============================================================================

function UnsupportedDetail({ item }: { item: FilePreviewItem }): JSX.Element {
	const ext = getExtension(item.name);
	const icon = iconForExt(ext);
	const colors = colorsForExt(ext);
	const downloadable = !!item.url;

	return (
		<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 py-12">
			<div
				className={cn(
					"relative flex h-28 w-28 items-center justify-center rounded-3xl shadow-[0_8px_24px_-6px_rgba(15,23,42,0.18)]",
					colors.bg,
				)}
			>
				<span className={cn(icon, "h-12 w-12", colors.text)} />
				{ext && (
					<div className="absolute -bottom-2 rounded-full border border-border/40 bg-background px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
						{ext}
					</div>
				)}
			</div>
			<div className="text-center">
				<p className="max-w-md break-all text-[14px] font-semibold text-foreground">{item.name}</p>
				{typeof item.size === "number" && (
					<p className="mt-1 text-[11px] text-muted-foreground/70">{formatSize(item.size)}</p>
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

// ============================================================================
// IO helpers
// ============================================================================

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

// ============================================================================
// Icon / color tables for unsupported detail
// ============================================================================

function iconForExt(ext: string): string {
	if (["pdf"].includes(ext)) return "icon-[mdi--file-pdf-box]";
	if (["doc", "docx"].includes(ext)) return "icon-[mdi--file-word-box]";
	if (["xls", "xlsx", "csv"].includes(ext)) return "icon-[mdi--file-excel-box]";
	if (["ppt", "pptx"].includes(ext)) return "icon-[mdi--file-powerpoint-box]";
	if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "icon-[mdi--folder-zip-outline]";
	if (["mp3", "wav", "flac", "ogg", "aac"].includes(ext)) return "icon-[mdi--file-music-outline]";
	if (["mp4", "mov", "mkv", "avi", "webm"].includes(ext)) return "icon-[mdi--file-video-outline]";
	if (["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"].includes(ext))
		return "icon-[mdi--file-image-outline]";
	if (["txt", "md", "log"].includes(ext)) return "icon-[mdi--file-document-outline]";
	if (["js", "ts", "tsx", "jsx", "go", "py", "java", "rb", "rs", "json", "yml", "yaml", "html", "css"].includes(ext))
		return "icon-[mdi--file-code-outline]";
	return "icon-[mdi--file-outline]";
}

function colorsForExt(ext: string): { bg: string; text: string } {
	if (["pdf"].includes(ext)) return { bg: "bg-red-50 dark:bg-red-500/10", text: "text-red-500" };
	if (["doc", "docx"].includes(ext)) return { bg: "bg-blue-50 dark:bg-blue-500/10", text: "text-blue-500" };
	if (["xls", "xlsx", "csv"].includes(ext))
		return { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-500" };
	if (["ppt", "pptx"].includes(ext))
		return { bg: "bg-orange-50 dark:bg-orange-500/10", text: "text-orange-500" };
	if (["zip", "rar", "7z", "tar", "gz"].includes(ext))
		return { bg: "bg-amber-50 dark:bg-amber-500/10", text: "text-amber-500" };
	if (["mp3", "wav", "flac", "ogg", "aac"].includes(ext))
		return { bg: "bg-pink-50 dark:bg-pink-500/10", text: "text-pink-500" };
	if (["mp4", "mov", "mkv", "avi", "webm"].includes(ext))
		return { bg: "bg-purple-50 dark:bg-purple-500/10", text: "text-purple-500" };
	return { bg: "bg-muted", text: "text-muted-foreground" };
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
