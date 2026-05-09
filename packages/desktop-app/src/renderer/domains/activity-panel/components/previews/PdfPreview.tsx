import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const ZOOM_STEP = 0.1;
const ZOOM_WHEEL_FACTOR = 0.002;

/** Decode base64 string to Uint8Array (handles all byte values). */
function base64ToUint8Array(base64: string): Uint8Array {
	const lookup = new Uint8Array(256);
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

	let len = base64.length;
	if (base64[len - 1] === "=") len--;
	if (base64[len - 1] === "=") len--;

	const byteLen = (len * 3) >> 2;
	const bytes = new Uint8Array(byteLen);
	let p = 0;

	for (let i = 0; i < len; i += 4) {
		const a = lookup[base64.charCodeAt(i)];
		const b = lookup[base64.charCodeAt(i + 1)];
		const c = lookup[base64.charCodeAt(i + 2)];
		const d = lookup[base64.charCodeAt(i + 3)];

		bytes[p++] = (a << 2) | (b >> 4);
		if (p < byteLen) bytes[p++] = ((b & 0xf) << 4) | (c >> 2);
		if (p < byteLen) bytes[p++] = ((c & 0x3) << 6) | d;
	}

	return bytes;
}

interface PdfPreviewProps {
	content: string; // base64 encoded
}

export function PdfPreview({ content }: PdfPreviewProps): JSX.Element {
	const scrollRef = useRef<HTMLDivElement>(null);
	const pagesRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState<"loading" | "error" | "done">("loading");
	const [pageCount, setPageCount] = useState(0);
	const [scale, setScale] = useState(1);
	const [isFullscreen, setIsFullscreen] = useState(false);

	useEffect(() => {
		let cancelled = false;
		const container = pagesRef.current;
		if (!container) return;

		container.innerHTML = "";
		setStatus("loading");

		const data = base64ToUint8Array(content);

		pdfjsLib
			.getDocument({ data })
			.promise.then(async (pdf) => {
				if (cancelled) return;
				setPageCount(pdf.numPages);

				for (let i = 1; i <= pdf.numPages; i++) {
					if (cancelled) break;
					const page = await pdf.getPage(i);
					const containerWidth = container.clientWidth - 32;
					const baseViewport = page.getViewport({ scale: 1 });
					const renderScale = Math.max(containerWidth / baseViewport.width, 0.5);
					const viewport = page.getViewport({ scale: renderScale });

					const canvas = document.createElement("canvas");
					const dpr = window.devicePixelRatio || 2;
					canvas.width = viewport.width * dpr;
					canvas.height = viewport.height * dpr;
					canvas.style.width = `${viewport.width}px`;
					canvas.style.height = `${viewport.height}px`;
					canvas.style.marginBottom = "8px";
					canvas.style.borderRadius = "4px";

					const ctx = canvas.getContext("2d")!;
					ctx.scale(dpr, dpr);

					await page.render({ canvasContext: ctx, viewport }).promise;
					if (!cancelled) container.appendChild(canvas);
				}

				if (!cancelled) setStatus("done");
			})
			.catch((err) => {
				console.error("PDF render error:", err);
				if (!cancelled) setStatus("error");
			});

		return () => {
			cancelled = true;
		};
	}, [content]);

	// Cmd/Ctrl + wheel → zoom; plain wheel → native scroll.
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;

		const onWheel = (e: WheelEvent) => {
			if (!(e.metaKey || e.ctrlKey)) return;
			e.preventDefault();
			setScale((prev) => {
				const delta = -e.deltaY * ZOOM_WHEEL_FACTOR;
				return Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta * prev));
			});
		};

		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, []);

	const zoomIn = useCallback(() => {
		setScale((s) => Math.min(MAX_SCALE, s + ZOOM_STEP));
	}, []);
	const zoomOut = useCallback(() => {
		setScale((s) => Math.max(MIN_SCALE, s - ZOOM_STEP));
	}, []);
	const resetZoom = useCallback(() => {
		setScale(1);
	}, []);
	const toggleFullscreen = useCallback(() => {
		setIsFullscreen((v) => !v);
	}, []);

	useEffect(() => {
		if (!isFullscreen) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				setIsFullscreen(false);
			}
		};
		document.addEventListener("keydown", onKeyDown, true);
		return () => document.removeEventListener("keydown", onKeyDown, true);
	}, [isFullscreen]);

	const pct = Math.round(scale * 100);

	return (
		<div
			className={
				isFullscreen
					? "fixed inset-0 z-50 flex flex-col overflow-hidden bg-background"
					: "relative flex flex-1 flex-col overflow-hidden bg-background"
			}
		>
			{/* Scrollable PDF area */}
			<div ref={scrollRef} className="flex-1 overflow-auto">
				<div
					ref={pagesRef}
					className="flex flex-col items-center p-4"
					style={{ zoom: scale }}
				/>

				{status === "loading" && (
					<div className="flex items-center justify-center p-8">
						<span className="icon-[mdi--loading] animate-spin text-[24px] text-muted-foreground/50" />
					</div>
				)}
				{status === "error" && (
					<div className="flex flex-col items-center justify-center gap-3 p-8 text-muted-foreground/50">
						<span className="icon-[mdi--alert-circle-outline] text-[40px]" />
						<span className="text-[13px]">无法渲染 PDF</span>
					</div>
				)}
				{status === "done" && pageCount > 0 && (
					<div className="pb-3 text-center text-[11px] text-muted-foreground/50">
						共 {pageCount} 页
					</div>
				)}
			</div>

			{/* Bottom zoom toolbar */}
			<div className="sticky bottom-0 z-10 flex items-center justify-center gap-1 border-t border-border bg-background px-2 py-1.5">
				<button
					type="button"
					onClick={zoomOut}
					title="缩小"
					className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/50 hover:bg-accent hover:text-foreground"
				>
					<span className="icon-[mdi--minus] text-[14px]" />
				</button>

				<button
					type="button"
					onClick={resetZoom}
					title="重置缩放"
					className="min-w-[44px] rounded px-1.5 py-0.5 text-center text-[11px] tabular-nums text-muted-foreground hover:bg-accent hover:text-foreground"
				>
					{pct}%
				</button>

				<button
					type="button"
					onClick={zoomIn}
					title="放大"
					className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/50 hover:bg-accent hover:text-foreground"
				>
					<span className="icon-[mdi--plus] text-[14px]" />
				</button>

				<div className="mx-1 h-3.5 w-px bg-border" />

				<button
					type="button"
					onClick={toggleFullscreen}
					title={isFullscreen ? "退出全屏" : "全屏"}
					className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/50 hover:bg-accent hover:text-foreground"
				>
					<span
						className={`${isFullscreen ? "icon-[mdi--fullscreen-exit]" : "icon-[mdi--fullscreen]"} text-[14px]`}
					/>
				</button>
			</div>
		</div>
	);
}
