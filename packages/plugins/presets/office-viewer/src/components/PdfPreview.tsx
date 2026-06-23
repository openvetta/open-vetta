import type { PluginFilePreviewProps } from "@vetta/plugin-sdk";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { ErrorState, LoadingState, type LoadState } from "./PreviewState";
import { ToolbarButton } from "./ToolbarButton";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export function PdfPreview({ file }: PluginFilePreviewProps): JSX.Element {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const documentRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
	const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
	const [status, setStatus] = useState<LoadState>("loading");
	const [page, setPage] = useState(1);
	const [pageCount, setPageCount] = useState(0);
	const [scale, setScale] = useState(1);

	const renderPage = useCallback(async (pageNumber: number, nextScale: number) => {
		const pdf = documentRef.current;
		const canvas = canvasRef.current;
		if (!pdf || !canvas) return;

		renderTaskRef.current?.cancel();
		const pdfPage = await pdf.getPage(pageNumber);
		const viewport = pdfPage.getViewport({ scale: nextScale });
		const dpr = window.devicePixelRatio || 1;
		canvas.width = Math.ceil(viewport.width * dpr);
		canvas.height = Math.ceil(viewport.height * dpr);
		canvas.style.width = `${viewport.width}px`;
		canvas.style.height = `${viewport.height}px`;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Canvas unavailable");
		const renderTask = pdfPage.render({
			canvasContext: context,
			viewport,
			transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
		});
		renderTaskRef.current = renderTask;
		await renderTask.promise;
		if (renderTaskRef.current === renderTask) renderTaskRef.current = null;
	}, []);

	useEffect(() => {
		let cancelled = false;
		setStatus("loading");
		setPage(1);
		setScale(1);
		const task = pdfjsLib.getDocument({ url: file.getUrl() });
		void task.promise
			.then(async (pdf) => {
				if (cancelled) {
					await pdf.destroy();
					return;
				}
				documentRef.current = pdf;
				setPageCount(pdf.numPages);
				await renderPage(1, 1);
				if (!cancelled) setStatus("ready");
			})
			.catch((error: unknown) => {
				if (!cancelled && !(error instanceof pdfjsLib.RenderingCancelledException)) setStatus("error");
			});

		return () => {
			cancelled = true;
			renderTaskRef.current?.cancel();
			renderTaskRef.current = null;
			documentRef.current = null;
			void task.destroy();
		};
	}, [file, renderPage]);

	useEffect(() => {
		if (status !== "ready") return;
		void renderPage(page, scale).catch((error: unknown) => {
			if (!(error instanceof pdfjsLib.RenderingCancelledException)) setStatus("error");
		});
	}, [page, scale, status, renderPage]);

	return (
		<div className="flex h-full min-h-0 flex-1 flex-col bg-[var(--background)]">
			<div className="flex min-h-0 flex-1 items-start justify-center overflow-auto bg-[var(--muted)] p-5">
				{status === "loading" && <LoadingState />}
				{status === "error" && <ErrorState message="无法渲染 PDF 文件" />}
				<canvas
					ref={canvasRef}
					className={status === "ready" ? "bg-white shadow-lg" : "hidden"}
					aria-label={`${file.name} 第 ${page} 页`}
				/>
			</div>
			<div className="flex shrink-0 items-center justify-center gap-2 border-t border-[var(--border)] px-3 py-2">
				<ToolbarButton label="上一页" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} />
				<span className="min-w-20 text-center text-[12px] tabular-nums text-[var(--muted-foreground)]">
					{pageCount > 0 ? `${page} / ${pageCount}` : "—"}
				</span>
				<ToolbarButton
					label="下一页"
					disabled={pageCount === 0 || page >= pageCount}
					onClick={() => setPage((value) => value + 1)}
				/>
				<div className="mx-1 h-4 w-px bg-[var(--border)]" />
				<ToolbarButton
					label="−"
					disabled={scale <= 0.5}
					onClick={() => setScale((value) => Math.max(0.5, value - 0.25))}
				/>
				<button
					type="button"
					className="min-w-14 text-[12px] tabular-nums text-[var(--muted-foreground)]"
					onClick={() => setScale(1)}
				>
					{Math.round(scale * 100)}%
				</button>
				<ToolbarButton
					label="+"
					disabled={scale >= 3}
					onClick={() => setScale((value) => Math.min(3, value + 0.25))}
				/>
			</div>
		</div>
	);
}
