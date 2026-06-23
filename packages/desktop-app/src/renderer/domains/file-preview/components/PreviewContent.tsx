import type { FilePreviewItem } from "@shared/store/atoms";
import { pluginFilePreviewsAtom, resolvedThemeAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { PluginFilePreview } from "./PluginFilePreview";
import { CodePreview } from "../../activity-panel/components/previews/CodePreview";
import { HtmlPreview } from "../../activity-panel/components/previews/HtmlPreview";
import { MarkdownPreview } from "../../activity-panel/components/previews/MarkdownPreview";

// 图片组灯箱仍由宿主外壳识别；实际图片内容预览由 media-viewer 系统插件接管。
export const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "ico"]);
// Chromium 原生可解码的音频格式（ADR-0021）；实际渲染由 media-viewer 系统插件接管。
export const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus", "webm"]);
export const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "ogv", "mov", "m4v"]);
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

/**
 * 预览标题：由预览层按类型自定义，灯箱/卡片只负责展示（图片放底部、其他放卡片顶部）。
 * 默认用文件名；个别类型如需不同标题，在此按扩展名覆盖即可。
 */
export function getPreviewLabel(item: FilePreviewItem): string {
	return item.name;
}

type LoadState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "loaded"; content: string; encoding: "utf8" | "base64" };

/**
 * 扩展名 → 预览组件的分发 + 加载状态机 + 文件实时刷新。
 * 内嵌预览（FilePreviewView）与全局灯箱（FilePreviewDialog）共用。
 */
export function PreviewBody({
	item,
	refreshNonce = 0,
}: {
	item: FilePreviewItem;
	refreshNonce?: number;
}): JSX.Element {
	const ext = useMemo(() => getExtension(item.name), [item.name]);
	const supported = isPreviewSupported(item.name);
	const theme = useAtomValue(resolvedThemeAtom);

	// 插件预览可接管注册扩展名；宿主只继续内置文本类兜底。
	const pluginPreviews = useAtomValue(pluginFilePreviewsAtom);
	const pluginPreview = useMemo(
		() => pluginPreviews.find((p) => p.extensions.includes(ext)),
		[pluginPreviews, ext],
	);

	const [state, setState] = useState<LoadState>({ status: "loading" });
	// 磁盘文件变化计数：递增触发静默重读，实现实时刷新
	const [watchTick, setWatchTick] = useState(0);

	const itemKey = item.path ?? item.url ?? item.name;
	const prevKeyRef = useRef<string | null>(null);

	useEffect(() => {
		if (pluginPreview || !supported) return;
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
	}, [item, ext, supported, pluginPreview, itemKey, watchTick, refreshNonce]);

	// 实时刷新：宿主内置文本预览监听文件所在目录；插件预览使用 PluginPreviewFile.watch。
	useEffect(() => {
		const path = item.path;
		if (!path || pluginPreview || !supported) return;
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
	}, [item.path, supported, pluginPreview]);

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

	if ((ext === "html" || ext === "htm") && state.encoding === "utf8") {
		return <HtmlPreview content={state.content} extension={ext} theme={theme} />;
	}

	const scrollWrap = "min-h-0 flex-1 overflow-y-auto";
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

export function downloadItem(item: FilePreviewItem): void {
	if (!item.url) return;
	void window.vetta.downloads.start({ url: item.url, filename: item.name });
}
