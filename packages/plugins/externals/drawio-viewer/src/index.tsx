import { definePlugin, type PluginFilePreviewProps } from "@vetta-org/plugin-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import viewerJs from "./vendor/viewer-static.min.js?raw";
import "./style.css";

type LoadState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "loaded"; text: string };

function formatBytes(bytes: number): string {
	if (!bytes) return "";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Spinner({ size = 16 }: { size?: number }) {
	return (
		<span
			className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
			style={{ width: size, height: size, opacity: 0.5 }}
		/>
	);
}

function ImageIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<rect x="3" y="3" width="18" height="18" rx="2" />
			<circle cx="9" cy="9" r="2" />
			<path d="m21 15-3.6-3.6a2 2 0 0 0-2.8 0L6 20" />
		</svg>
	);
}

// 把 drawio XML 渲染进隔离 iframe：内联 viewer 引擎，离线可用，并把 drawio 的
// 全局变量/CSS 与宿主隔开。渲染前置 mxClient.NO_FO=true，让标签走 SVG <text>
// 而非 foreignObject —— 既稳定显示，也让导出的 PNG 带上文字。
function renderInto(iframe: HTMLIFrameElement, xml: string): void {
	const doc = iframe.contentDocument;
	if (!doc) return;

	doc.open();
	doc.write(
		'<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
			"html,body{margin:0;padding:0;height:100%;background:transparent;}" +
			".mxgraph{max-width:none!important;}" +
			"</style></head><body></body></html>",
	);
	doc.close();

	const graph = doc.createElement("div");
	graph.className = "mxgraph";
	graph.style.width = "100%";
	graph.style.height = "100%";
	graph.setAttribute(
		"data-mxgraph",
		JSON.stringify({
			highlight: "#0066cc",
			nav: true,
			resize: false,
			toolbar: "zoom layers",
			xml,
		}),
	);
	doc.body.appendChild(graph);

	// 引擎加载末尾会调用 window.onDrawioViewerLoad（若存在）。在这里：
	//  1) 关掉 foreignObject（NO_FO），让标签走 SVG <text>，导出 PNG 才带文字；
	//  2) 不走默认的 processElements（它会把容器收缩到图的原始尺寸、左上对齐），
	//     改用 createViewerForElement 拿到实例后强制铺满容器并 fit + center。
	const initScript = doc.createElement("script");
	initScript.textContent = `window.onDrawioViewerLoad=function(){
try{if(window.mxClient)window.mxClient.NO_FO=true;}catch(e){}
var els=document.getElementsByClassName('mxgraph');
for(var i=0;i<els.length;i++){(function(el){
window.GraphViewer.createViewerForElement(el,function(viewer){
var graph=viewer.graph;graph.maxFitScale=8;
var fit=function(){try{
var c=graph.container;c.style.width='100%';c.style.height='100%';c.style.overflow='hidden';
graph.fit(20);graph.center(true,true);
}catch(e){}};
fit();setTimeout(fit,50);
window.addEventListener('resize',fit);
});
})(els[i]);}
};`;
	doc.body.appendChild(initScript);

	// 用 textContent 注入引擎，避免 </script> 转义问题。
	const engine = doc.createElement("script");
	engine.textContent = viewerJs;
	doc.body.appendChild(engine);
}

// 读取 iframe 内 viewer 渲染出的 SVG，转 2x PNG 下载（同源，可直接取 contentDocument）。
async function exportPng(iframe: HTMLIFrameElement, fileName: string): Promise<void> {
	const doc = iframe.contentDocument;
	const svg = doc?.querySelector("svg");
	if (!svg) throw new Error("图形尚未渲染完成");

	// 用实际渲染尺寸（fit 后铺满容器），而非可能过时的 width/height 属性。
	const rect = svg.getBoundingClientRect();
	const width = rect.width || Number.parseFloat(svg.getAttribute("width") || "") || 800;
	const height = rect.height || Number.parseFloat(svg.getAttribute("height") || "") || 600;

	const clone = svg.cloneNode(true) as SVGSVGElement;
	clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
	clone.setAttribute("width", String(width));
	clone.setAttribute("height", String(height));

	const data = new XMLSerializer().serializeToString(clone);
	const svgUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(data)))}`;

	const scale = 2;
	const blob = await new Promise<Blob | null>((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			const canvas = document.createElement("canvas");
			canvas.width = Math.max(1, Math.round(width * scale));
			canvas.height = Math.max(1, Math.round(height * scale));
			const ctx = canvas.getContext("2d");
			if (!ctx) return reject(new Error("无法创建画布"));
			ctx.fillStyle = "#ffffff";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.scale(scale, scale);
			ctx.drawImage(img, 0, 0);
			canvas.toBlob((b) => resolve(b), "image/png");
		};
		img.onerror = () => reject(new Error("SVG 转图片失败"));
		img.src = svgUrl;
	});
	if (!blob) throw new Error("生成 PNG 失败");

	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `${fileName.replace(/\.[^.]+$/, "")}.png`;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DrawioPreview({ file }: PluginFilePreviewProps) {
	const [state, setState] = useState<LoadState>({ status: "loading" });
	const [mode, setMode] = useState<"preview" | "source">("preview");
	const [exporting, setExporting] = useState(false);
	const [exportError, setExportError] = useState<string | null>(null);
	const iframeRef = useRef<HTMLIFrameElement | null>(null);

	const load = useCallback(() => {
		let cancelled = false;
		file
			.readText()
			.then((text) => {
				if (!cancelled) setState({ status: "loaded", text });
			})
			.catch(() => {
				if (!cancelled) setState({ status: "error", message: "无法读取此 drawio 文件" });
			});
		return () => {
			cancelled = true;
		};
	}, [file]);

	useEffect(() => {
		setState({ status: "loading" });
		return load();
	}, [load]);

	// 文件被改写时实时重读刷新（宿主侧已做 300ms 防抖）。
	useEffect(() => {
		const watch = file.watch(load);
		return () => watch.dispose();
	}, [file, load]);

	// state / mode 变化后重渲染 iframe。
	useEffect(() => {
		if (mode !== "preview" || state.status !== "loaded") return;
		const iframe = iframeRef.current;
		if (iframe) renderInto(iframe, state.text);
	}, [mode, state]);

	const onExport = useCallback(async () => {
		const iframe = iframeRef.current;
		if (!iframe) return;
		setExportError(null);
		setExporting(true);
		try {
			await exportPng(iframe, file.name);
		} catch (err) {
			setExportError(err instanceof Error ? err.message : "导出失败");
		} finally {
			setExporting(false);
		}
	}, [file.name]);

	const tab =
		"cursor-pointer rounded-[7px] px-[11px] py-[4px] text-[12px] font-semibold transition-colors";
	const tabActive = "bg-[var(--background)] text-[var(--foreground)] shadow-[var(--shadow-sm)]";
	const tabIdle = "text-[var(--muted-foreground)] hover:text-[var(--foreground)]";

	const canExport = mode === "preview" && state.status === "loaded" && !exporting;

	return (
		<div className="flex h-full min-h-0 flex-1 flex-col bg-[var(--background)] font-[var(--font-sans)]">
			<div className="flex shrink-0 items-center gap-[10px] border-b border-[color-mix(in_srgb,var(--border)_55%,transparent)] bg-[color-mix(in_srgb,var(--muted)_35%,var(--background))] px-[12px] py-[8px]">
				<div className="flex items-center gap-[2px] rounded-[9px] bg-[var(--muted)] p-[2px]">
					<button
						type="button"
						className={`${tab} ${mode === "preview" ? tabActive : tabIdle}`}
						onClick={() => setMode("preview")}
					>
						渲染
					</button>
					<button
						type="button"
						className={`${tab} ${mode === "source" ? tabActive : tabIdle}`}
						onClick={() => setMode("source")}
					>
						源码
					</button>
				</div>

				<button
					type="button"
					disabled={!canExport}
					onClick={onExport}
					title="导出为 PNG"
					className="flex items-center gap-[6px] rounded-[8px] border border-[color-mix(in_srgb,var(--border)_60%,transparent)] bg-[var(--background)] px-[10px] py-[5px] text-[12px] font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
				>
					{exporting ? <Spinner size={14} /> : <ImageIcon />}
					{exporting ? "导出中…" : "导出 PNG"}
				</button>

				{exportError && (
					<span className="text-[11px] text-[var(--destructive)]" title={exportError}>
						{exportError}
					</span>
				)}

				<div className="ml-auto flex items-center gap-[8px] text-[11px] text-[var(--muted-foreground)]">
					<span className="rounded-full bg-[var(--muted)] px-[8px] py-[2px] font-bold tracking-wider uppercase">
						{file.extension || "drawio"}
					</span>
					{file.size > 0 && <span className="tabular-nums">{formatBytes(file.size)}</span>}
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-hidden">
				{state.status === "loading" && (
					<div className="flex h-full items-center justify-center gap-[8px] text-[13px] text-[var(--muted-foreground)]">
						<Spinner />
						加载中…
					</div>
				)}
				{state.status === "error" && (
					<div className="flex h-full flex-col items-center justify-center gap-[8px] text-[13px] text-[var(--destructive)]">
						{state.message}
					</div>
				)}
				{state.status === "loaded" &&
					(mode === "preview" ? (
						<div
							className="h-full w-full"
							style={{
								backgroundColor: "var(--muted)",
								backgroundImage:
									"radial-gradient(color-mix(in srgb, var(--foreground) 10%, transparent) 1px, transparent 1px)",
								backgroundSize: "18px 18px",
							}}
						>
							<iframe ref={iframeRef} title={file.name} className="h-full w-full border-0" />
						</div>
					) : (
						<pre className="h-full overflow-auto bg-[var(--card)] p-[16px] text-[12px] leading-[1.6] text-[var(--foreground)]">
							<code>{state.text}</code>
						</pre>
					))}
			</div>
		</div>
	);
}

export default definePlugin({
	activate(ctx) {
		ctx.ui.registerFilePreview({
			extensions: ["drawio", "dio"],
			component: DrawioPreview,
		});
	},
});
