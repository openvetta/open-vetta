import { exportToBlob, exportToSvg } from "@excalidraw/excalidraw";
import { type PluginFilePreviewProps, useTranslation } from "@vetta/plugin-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ExportOpts = Parameters<typeof exportToSvg>[0];

interface ExcalidrawScene {
	elements?: ExportOpts["elements"];
	appState?: ExportOpts["appState"];
	files?: ExportOpts["files"];
}

type RenderState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "empty"; text: string }
	| {
			status: "loaded";
			text: string;
			scene: ExcalidrawScene;
			svg: string;
			width: number;
			height: number;
	  };

type Background = "black" | "white";

const BG_COLOR: Record<Background, string> = { black: "#000000", white: "#ffffff" };

const CONTENT_PADDING = 20;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function formatBytes(bytes: number): string {
	if (!bytes) return "";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function dimension(svg: SVGSVGElement, attr: "width" | "height", index: 2 | 3): number {
	const raw = Number.parseFloat(svg.getAttribute(attr) ?? "");
	if (Number.isFinite(raw) && raw > 0) return raw;
	const box = svg.getAttribute("viewBox")?.split(/\s+/);
	const fromBox = box ? Number.parseFloat(box[index] ?? "") : NaN;
	return Number.isFinite(fromBox) && fromBox > 0 ? fromBox : 1;
}

export function ExcalidrawPreview({ file }: PluginFilePreviewProps) {
	const { t } = useTranslation();
	const [state, setState] = useState<RenderState>({ status: "loading" });
	const [mode, setMode] = useState<"preview" | "source">("preview");
	// 背景默认白色，与主题无关；用户可自行切换为黑色。
	const [background, setBackground] = useState<Background>("white");

	// 缩放：userZoom 为 null 时自适应容器（按宽高缩放铺满），手动操作后切换为固定值。
	const [userZoom, setUserZoom] = useState<number | null>(null);
	const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);

	const scrollRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
	const [dragging, setDragging] = useState(false);

	useEffect(() => {
		let cancelled = false;

		const load = async (initial: boolean) => {
			if (initial) setState({ status: "loading" });
			try {
				const text = await file.readText();
				let scene: ExcalidrawScene;
				try {
					scene = JSON.parse(text) as ExcalidrawScene;
				} catch {
					if (!cancelled) setState({ status: "error", message: t("error.parse") });
					return;
				}
				const elements = scene.elements ?? [];
				if (elements.length === 0) {
					if (!cancelled) setState({ status: "empty", text });
					return;
				}
				const svg = await exportToSvg({
					elements,
					appState: { ...scene.appState, exportBackground: false },
					files: scene.files ?? null,
				});
				if (cancelled) return;
				setState({
					status: "loaded",
					text,
					scene,
					svg: new XMLSerializer().serializeToString(svg),
					width: dimension(svg, "width", 2),
					height: dimension(svg, "height", 3),
				});
			} catch {
				if (!cancelled) setState({ status: "error", message: t("error.render") });
			}
		};

		void load(true);
		// 实时刷新：磁盘文件变化时静默重渲染。
		const watcher = file.watch(() => void load(false));

		return () => {
			cancelled = true;
			watcher.dispose();
		};
	}, [file, t]);

	const natural = state.status === "loaded" ? { w: state.width, h: state.height } : null;

	// 自适应缩放：在容器内按宽高铺满，不放大超过 100%。
	const fitZoom = useMemo(() => {
		if (!natural || !containerSize) return 1;
		const availW = containerSize.w - CONTENT_PADDING * 2;
		const availH = containerSize.h - CONTENT_PADDING * 2;
		if (availW <= 0 || availH <= 0) return 1;
		return clamp(Math.min(availW / natural.w, availH / natural.h), MIN_ZOOM, 1);
	}, [natural, containerSize]);

	const zoom = userZoom ?? fitZoom;
	const fitZoomRef = useRef(fitZoom);
	fitZoomRef.current = fitZoom;

	const scaled = useMemo(() => {
		if (!natural) return null;
		return { width: natural.w * zoom, height: natural.h * zoom };
	}, [natural, zoom]);

	// 监听容器尺寸，驱动自适应缩放。
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
		update();
		const observer = new ResizeObserver(update);
		observer.observe(el);
		return () => observer.disconnect();
	}, [state.status, mode]);

	// 鼠标滚轮缩放（非 passive，需阻止默认滚动）。
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const base = userZoom ?? fitZoomRef.current;
			const next = clamp(+(base * Math.exp(-e.deltaY * 0.0015)).toFixed(3), MIN_ZOOM, MAX_ZOOM);
			setUserZoom(next);
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [state.status, mode, userZoom]);

	const stepZoom = useCallback((delta: number) => {
		setUserZoom((prev) => clamp(+((prev ?? fitZoomRef.current) + delta).toFixed(2), MIN_ZOOM, MAX_ZOOM));
	}, []);

	const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		const el = scrollRef.current;
		if (!el || e.button !== 0) return;
		dragRef.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
		el.setPointerCapture(e.pointerId);
		setDragging(true);
	}, []);

	const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		const el = scrollRef.current;
		const start = dragRef.current;
		if (!el || !start) return;
		el.scrollLeft = start.left - (e.clientX - start.x);
		el.scrollTop = start.top - (e.clientY - start.y);
	}, []);

	const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		const el = scrollRef.current;
		if (el && dragRef.current) el.releasePointerCapture(e.pointerId);
		dragRef.current = null;
		setDragging(false);
	}, []);

	const onExport = useCallback(async () => {
		if (state.status !== "loaded") return;
		try {
			const blob = await exportToBlob({
				elements: state.scene.elements ?? [],
				appState: {
					...state.scene.appState,
					exportBackground: true,
					viewBackgroundColor: BG_COLOR[background],
					exportScale: 2,
				},
				files: state.scene.files ?? null,
				mimeType: "image/png",
				exportPadding: 16,
			});
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = `${file.name.replace(/\.excalidraw$/i, "")}.png`;
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			URL.revokeObjectURL(url);
		} catch {
			// 导出失败静默处理，不阻断预览。
		}
	}, [state, background, file.name]);

	const tab =
		"cursor-pointer rounded-[7px] px-[10px] py-[4px] text-[12px] font-semibold transition-colors";
	const tabActive = "bg-[var(--background)] text-[var(--foreground)] shadow-[var(--shadow-sm)]";
	const tabIdle = "text-[var(--muted-foreground)] hover:text-[var(--foreground)]";
	const iconBtn =
		"flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-[13px] text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]";

	return (
		<div className="flex h-full min-h-0 flex-1 flex-col bg-[var(--background)] font-[var(--font-sans)]">
			<div className="flex shrink-0 items-center gap-[8px] border-b border-[color-mix(in_srgb,var(--border)_50%,transparent)] px-[10px] py-[7px]">
				<div className="flex items-center gap-[2px] rounded-[9px] bg-[var(--muted)] p-[2px]">
					<button
						type="button"
						className={`${tab} ${mode === "preview" ? tabActive : tabIdle}`}
						onClick={() => setMode("preview")}
					>
						{t("tab.rendered")}
					</button>
					<button
						type="button"
						className={`${tab} ${mode === "source" ? tabActive : tabIdle}`}
						onClick={() => setMode("source")}
					>
						{t("tab.source")}
					</button>
				</div>

				{mode === "preview" && state.status === "loaded" && (
					<div className="flex items-center gap-[2px]">
						<button
							type="button"
							className={iconBtn}
							title={t("action.zoomOut")}
							onClick={() => stepZoom(-0.25)}
						>
							−
						</button>
						<button
							type="button"
							className="min-w-[44px] rounded-[7px] px-[4px] text-center text-[12px] tabular-nums text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
							title={t("action.fit")}
							onClick={() => setUserZoom(null)}
						>
							{Math.round(zoom * 100)}%
						</button>
						<button
							type="button"
							className={iconBtn}
							title={t("action.zoomIn")}
							onClick={() => stepZoom(0.25)}
						>
							+
						</button>

						<div className="mx-[4px] h-[16px] w-px bg-[var(--border)]" />

						<div className="flex items-center gap-[3px]">
							{(["black", "white"] as const).map((value) => (
								<button
									key={value}
									type="button"
									title={value === "black" ? t("action.bgBlack") : t("action.bgWhite")}
									aria-pressed={background === value}
									onClick={() => setBackground(value)}
									className={`h-[18px] w-[18px] rounded-full border transition-shadow ${
										background === value
											? "border-[var(--ring)] shadow-[0_0_0_2px_var(--ring)]"
											: "border-[var(--border)]"
									}`}
									style={{ backgroundColor: BG_COLOR[value] }}
								/>
							))}
						</div>

						<div className="mx-[4px] h-[16px] w-px bg-[var(--border)]" />

						<button
							type="button"
							className={iconBtn}
							title={t("action.export")}
							onClick={() => void onExport()}
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
								<polyline points="7 10 12 15 17 10" />
								<line x1="12" y1="15" x2="12" y2="3" />
							</svg>
						</button>
					</div>
				)}

				<div className="ml-auto flex items-center gap-[8px] text-[11px] text-[var(--muted-foreground)]">
					<span className="rounded-full bg-[var(--muted)] px-[7px] py-[2px] font-bold tracking-wider uppercase">
						excalidraw
					</span>
					{file.size > 0 && <span className="tabular-nums">{formatBytes(file.size)}</span>}
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-hidden">
				{state.status === "loading" && (
					<div className="flex h-full items-center justify-center text-[13px] text-[var(--muted-foreground)]">
						{t("state.loading")}
					</div>
				)}
				{state.status === "error" && (
					<div className="flex h-full items-center justify-center text-[13px] text-[var(--destructive)]">
						{state.message}
					</div>
				)}
				{state.status === "empty" &&
					(mode === "source" ? (
						<pre className="h-full overflow-auto bg-[var(--card)] p-[16px] text-[12px] leading-[1.6] text-[var(--foreground)]">
							<code>{state.text}</code>
						</pre>
					) : (
						<div className="flex h-full items-center justify-center text-[13px] text-[var(--muted-foreground)]">
							{t("state.empty")}
						</div>
					))}
				{state.status === "loaded" &&
					(mode === "preview" ? (
						<div
							ref={scrollRef}
							className={`flex h-full w-full select-none items-center justify-center overflow-auto p-[20px] ${
								dragging ? "cursor-grabbing" : "cursor-grab"
							}`}
							style={{ backgroundColor: BG_COLOR[background] }}
							onPointerDown={onPointerDown}
							onPointerMove={onPointerMove}
							onPointerUp={onPointerUp}
							onPointerCancel={onPointerUp}
						>
							{scaled && (
								<div
									className="shrink-0 [&>svg]:h-full [&>svg]:w-full"
									style={{ width: scaled.width, height: scaled.height }}
									// exportToSvg 产出的是受信任的本地场景渲染结果，非远程 HTML。
									dangerouslySetInnerHTML={{ __html: state.svg }}
								/>
							)}
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
