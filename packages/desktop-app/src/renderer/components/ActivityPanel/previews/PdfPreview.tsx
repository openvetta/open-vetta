import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ZoomableView } from "./ZoomableView";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

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
	const containerRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState<"loading" | "error" | "done">("loading");
	const [pageCount, setPageCount] = useState(0);

	useEffect(() => {
		let cancelled = false;
		const container = containerRef.current;
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
					const scale = Math.max(containerWidth / baseViewport.width, 0.5);
					const viewport = page.getViewport({ scale });

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

	return (
		<ZoomableView>
			{/* containerRef is always mounted so the useEffect can render into it */}
			<div ref={containerRef} className="flex flex-col items-center p-4" />

			{status === "loading" && (
				<div className="flex items-center justify-center p-8">
					<span className="icon-[mdi--loading] animate-spin text-[24px] text-[var(--text-3)]" />
				</div>
			)}
			{status === "error" && (
				<div className="flex flex-col items-center justify-center gap-3 p-8 text-[var(--text-3)]">
					<span className="icon-[mdi--alert-circle-outline] text-[40px]" />
					<span className="text-[13px]">无法渲染 PDF</span>
				</div>
			)}
			{status === "done" && pageCount > 0 && (
				<div className="pb-3 text-center text-[11px] text-[var(--text-3)]">
					共 {pageCount} 页
				</div>
			)}
		</ZoomableView>
	);
}
