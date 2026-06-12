import { cn } from "@shared/lib/utils";
import {
	type FilePreviewContext,
	type FilePreviewItem,
	pluginFilePreviewsAtom,
	resolvedThemeAtom,
} from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PluginFilePreview } from "./PluginFilePreview";
import { PreviewErrorBoundary } from "./PreviewErrorBoundary";
import { AudioPreview } from "../../activity-panel/components/previews/AudioPreview";
import { CodePreview } from "../../activity-panel/components/previews/CodePreview";
import { DocxPreview } from "../../activity-panel/components/previews/DocxPreview";
import { HtmlPreview } from "../../activity-panel/components/previews/HtmlPreview";
import { ImagePreview } from "../../activity-panel/components/previews/ImagePreview";
import { MarkdownPreview } from "../../activity-panel/components/previews/MarkdownPreview";
import { PdfPreview } from "../../activity-panel/components/previews/PdfPreview";

// svg 刻意不在内置集：交给 svg-viewer 插件接管（「仅补空白」下插件只能拿内置不认的扩展名）
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "ico"]);
// Chromium 原生可解码的音频格式（ADR-0021）；wma/ape 等维持「不支持 + 下载」
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus", "webm"]);
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
	...AUDIO_EXTENSIONS,
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
				<HeaderButton icon="icon-[mdi--download]" title="下载" onClick={() => downloadItem(item)} />
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

type LoadState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "loaded"; content: string; encoding: "utf8" | "base64" };

function PreviewBody({ item, refreshNonce }: { item: FilePreviewItem; refreshNonce: number }): JSX.Element {
	const ext = useMemo(() => getExtension(item.name), [item.name]);
	const supported = isPreviewSupported(item.name);
	// 音频不走 readFile/fetch 全量加载：本地经媒体流协议、远程直接作 src（ADR-0021）
	const isAudio = AUDIO_EXTENSIONS.has(ext);
	const theme = useAtomValue(resolvedThemeAtom);

	// 插件预览「仅补空白」：仅当内置不支持该扩展名时才查插件注册表，首个匹配胜。
	const pluginPreviews = useAtomValue(pluginFilePreviewsAtom);
	const pluginPreview = useMemo(
		() => (supported ? undefined : pluginPreviews.find((p) => p.extensions.includes(ext))),
		[supported, pluginPreviews, ext],
	);

	const [state, setState] = useState<LoadState>({ status: "loading" });
	// 磁盘文件变化计数：递增触发静默重读，实现实时刷新
	const [watchTick, setWatchTick] = useState(0);

	const itemKey = item.path ?? item.url ?? item.name;
	const prevKeyRef = useRef<string | null>(null);

	useEffect(() => {
		if (!supported || isAudio) return;
		let cancelled = false;
		// 仅在切换到新文件时显示 loading；刷新 / 实时更新时保留旧内容，避免闪烁
		const isNewItem = prevKeyRef.current !== itemKey;
		prevKeyRef.current = itemKey;
		if (isNewItem) setState({ status: "loading" });

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
	}, [item, ext, supported, isAudio, itemKey, watchTick, refreshNonce]);

	// 实时刷新：监听文件所在目录，磁盘变化时重读内容（与插件预览同一套机制）
	useEffect(() => {
		const path = item.path;
		if (!path || !supported || isAudio) return;
		const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
		const dir = slash > 0 ? path.slice(0, slash) : path;
		void window.vetta.fs.watchDir(dir);
		const unsub = window.vetta.fs.onDirChanged((changed) => {
			if (changed === dir) setWatchTick((t) => t + 1);
		});
		return () => {
			unsub();
			void window.vetta.fs.unwatchDir(dir);
		};
	}, [item.path, supported, isAudio]);

	if (!supported) {
		if (pluginPreview) {
			// refreshNonce 入 key：手动刷新时重挂载插件预览，触发其重新读取
			return (
				<PluginFilePreview
					key={`${itemKey}-${refreshNonce}`}
					item={item}
					ext={ext}
					component={pluginPreview.component}
				/>
			);
		}
		return <UnsupportedDetail item={item} />;
	}

	if (isAudio) {
		// key 保证切换文件 / 手动刷新时整组件重挂载，停掉上一首的播放与动画
		return <AudioPreview key={`${itemKey}-${refreshNonce}`} item={item} />;
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
