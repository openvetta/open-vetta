import { pluginFilePreviewsAtom, resolvedThemeAtom } from "@shared/store/atoms";
import type { FilePreviewItem, PreviewBodyViewProps } from "@vetta/theme-ui/file-preview";
import { getExtension } from "@vetta/theme-ui/file-preview";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { CodePreview } from "../../activity-panel/components/previews/CodePreview";
import { HtmlPreview } from "../../activity-panel/components/previews/HtmlPreview";
import { MarkdownPreview } from "../../activity-panel/components/previews/MarkdownPreview";
import { PluginI18nBoundary } from "../../plugins/runtime/plugin-i18n";
import { PluginFilePreview } from "../components/PluginFilePreview";
import { downloadItem, isPreviewSupported, isTextExtension } from "../preview-utils";

const MARKDOWN_EXTENSIONS = new Set(["md", "mdx"]);

type LoadState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "loaded"; content: string; encoding: "utf8" | "base64" };

export function usePreviewBodyModel(
	item: FilePreviewItem,
	refreshNonce = 0,
): PreviewBodyViewProps {
	const ext = useMemo(() => getExtension(item.name), [item.name]);
	const supported = isPreviewSupported(item.name);
	const theme = useAtomValue(resolvedThemeAtom);
	const pluginPreviews = useAtomValue(pluginFilePreviewsAtom);
	const pluginPreview = useMemo(
		() => pluginPreviews.find((p) => p.extensions.includes(ext)),
		[pluginPreviews, ext],
	);

	const [state, setState] = useState<LoadState>({ status: "loading" });
	const [watchTick, setWatchTick] = useState(0);
	const itemKey = item.path ?? item.url ?? item.name;
	const prevKeyRef = useRef<string | null>(null);

	useEffect(() => {
		if (pluginPreview || !supported) return;
		let cancelled = false;
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

	const labels = {
		unsupported: "暂不支持预览此文件格式",
		download: "下载文件",
	};

	if (pluginPreview) {
		return {
			state: {
				status: "plugin",
				content: (
					<PluginI18nBoundary pluginId={pluginPreview.pluginId}>
						<PluginFilePreview
							key={`${itemKey}-${refreshNonce}`}
							item={item}
							ext={ext}
							component={pluginPreview.component}
						/>
					</PluginI18nBoundary>
				),
			},
			labels,
			onDownload: (it) => void downloadItem(it),
		};
	}

	if (!supported) {
		return {
			state: { status: "unsupported", item },
			labels,
			onDownload: (it) => void downloadItem(it),
		};
	}

	if (state.status === "loading") {
		return { state: { status: "loading" }, labels, onDownload: (it) => void downloadItem(it) };
	}

	if (state.status === "error") {
		return {
			state: { status: "error", message: state.message },
			labels,
			onDownload: (it) => void downloadItem(it),
		};
	}

	const scrollWrap = "text-preview-content min-h-0 flex-1 overflow-y-auto";
	let content: React.ReactNode;
	if ((ext === "html" || ext === "htm") && state.encoding === "utf8") {
		content = <HtmlPreview content={state.content} extension={ext} theme={theme} />;
	} else if (MARKDOWN_EXTENSIONS.has(ext)) {
		content = (
			<div className={scrollWrap}>
				<MarkdownPreview content={state.content} />
			</div>
		);
	} else if (ext === "json" && state.encoding === "utf8") {
		let formatted = state.content;
		try {
			formatted = JSON.stringify(JSON.parse(state.content), null, 2);
		} catch {
			// keep original
		}
		content = (
			<div className={scrollWrap}>
				<CodePreview content={formatted} extension={ext} theme={theme} />
			</div>
		);
	} else {
		content = (
			<div className={scrollWrap}>
				<CodePreview content={state.content} extension={ext} theme={theme} />
			</div>
		);
	}

	return {
		state: { status: "content", content },
		labels,
		onDownload: (it) => void downloadItem(it),
	};
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

	if (isTextExtension(ext)) {
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
