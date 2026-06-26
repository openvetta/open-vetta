import { useTranslation } from "@vetta/plugin-sdk";
import type { JSX, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PreviewToolbar } from "./PreviewToolbar";
import { ToolbarButton } from "./ToolbarButton";

const MIN_SCALE = 0.02;
const MAX_SCALE = 16;
const ZOOM_FACTOR = 1.2;
const ZOOM_WHEEL_FACTOR = 0.002;
const FIT_PADDING = 16;

interface Size {
	width: number;
	height: number;
}

interface ZoomableViewProps {
	// 内容的原始像素尺寸；用于把适配(fit)折算成绝对 scale，让缩放统一走 GPU transform
	naturalSize: Size | null;
	children: ReactNode;
}

const clampScale = (value: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

// 按宽度适配、不放大超过原始像素；缩放后内容在视口内居中（任一轴超出则留 padding 顶/左对齐）
function computeFit(vw: number, vh: number, iw: number, ih: number): { scale: number; offset: { x: number; y: number } } | null {
	if (!vw || !vh || !iw || !ih) return null;
	const scale = Math.min(1, (vw - FIT_PADDING * 2) / iw);
	const sw = iw * scale;
	const sh = ih * scale;
	const x = sw <= vw ? (vw - sw) / 2 : FIT_PADDING;
	const y = sh <= vh ? (vh - sh) / 2 : FIT_PADDING;
	return { scale, offset: { x, y } };
}

export function ZoomableView({ naturalSize, children }: ZoomableViewProps): JSX.Element {
	const { t } = useTranslation();
	const containerRef = useRef<HTMLDivElement>(null);
	const viewportRef = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);
	const [fitScale, setFitScale] = useState(1);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [isPanning, setIsPanning] = useState(false);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [autoFit, setAutoFit] = useState(true);
	const spaceDownRef = useRef(false);
	const panStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
	const sizeRef = useRef<Size | null>(null);
	const natRef = useRef<Size | null>(null);
	const autoFitRef = useRef(true);

	// 重新适配：读取最新视口/原始尺寸，把 scale/offset 设为居中 fit 状态
	const applyFit = useCallback(() => {
		const size = sizeRef.current;
		const nat = natRef.current;
		if (!size || !nat) return;
		const fit = computeFit(size.width, size.height, nat.width, nat.height);
		if (!fit) return;
		autoFitRef.current = true;
		setAutoFit(true);
		setFitScale(fit.scale);
		setScale(fit.scale);
		setOffset(fit.offset);
	}, []);

	// 用户主动缩放/平移后退出自动适配，面板尺寸变化时不再覆盖用户视图
	const markInteracted = useCallback(() => {
		if (autoFitRef.current) {
			autoFitRef.current = false;
			setAutoFit(false);
		}
	}, []);

	useEffect(() => {
		natRef.current = naturalSize;
		if (naturalSize) {
			autoFitRef.current = true;
			setAutoFit(true);
			applyFit();
		}
	}, [naturalSize, applyFit]);

	// 视口尺寸变化（含面板开合动画的逐帧宽度变化、全屏切换）时，仅在自动适配状态下重算 scale —— 走 transform 不重排
	useEffect(() => {
		const el = viewportRef.current;
		if (!el) return;
		const ro = new ResizeObserver((entries) => {
			const rect = entries[0].contentRect;
			sizeRef.current = { width: rect.width, height: rect.height };
			if (autoFitRef.current) applyFit();
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, [applyFit]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.code === "Space" && !e.repeat) {
				e.preventDefault();
				spaceDownRef.current = true;
				container.style.cursor = "grab";
			}
		};
		const onKeyUp = (e: KeyboardEvent) => {
			if (e.code === "Space") {
				spaceDownRef.current = false;
				if (!isPanning) container.style.cursor = "";
			}
		};

		container.addEventListener("keydown", onKeyDown);
		container.addEventListener("keyup", onKeyUp);
		return () => {
			container.removeEventListener("keydown", onKeyDown);
			container.removeEventListener("keyup", onKeyUp);
		};
	}, [isPanning]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			markInteracted();

			if (e.metaKey || e.ctrlKey) {
				const rect = container.getBoundingClientRect();
				const cursorX = e.clientX - rect.left;
				const cursorY = e.clientY - rect.top;

				setScale((prev) => {
					const delta = -e.deltaY * ZOOM_WHEEL_FACTOR;
					const next = clampScale(prev + delta * prev);
					const ratio = next / prev;

					setOffset((current) => ({
						x: cursorX - ratio * (cursorX - current.x),
						y: cursorY - ratio * (cursorY - current.y),
					}));

					return next;
				});
			} else {
				setOffset((current) => ({
					x: current.x - e.deltaX,
					y: current.y - e.deltaY,
				}));
			}
		};

		container.addEventListener("wheel", onWheel, { passive: false });
		return () => container.removeEventListener("wheel", onWheel);
	}, [markInteracted]);

	const onPointerDown = useCallback(
		(e: ReactPointerEvent) => {
			if (!spaceDownRef.current) return;
			e.preventDefault();
			markInteracted();
			setIsPanning(true);
			panStartRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };

			const container = containerRef.current;
			if (container) container.style.cursor = "grabbing";

			const onPointerMove = (ev: PointerEvent) => {
				const dx = ev.clientX - panStartRef.current.x;
				const dy = ev.clientY - panStartRef.current.y;
				setOffset({ x: panStartRef.current.ox + dx, y: panStartRef.current.oy + dy });
			};
			const onPointerUp = () => {
				setIsPanning(false);
				document.removeEventListener("pointermove", onPointerMove);
				document.removeEventListener("pointerup", onPointerUp);
				if (container) container.style.cursor = spaceDownRef.current ? "grab" : "";
			};
			document.addEventListener("pointermove", onPointerMove);
			document.addEventListener("pointerup", onPointerUp);
		},
		[offset, markInteracted],
	);

	const zoomIn = useCallback(() => {
		markInteracted();
		setScale((value) => clampScale(value * ZOOM_FACTOR));
	}, [markInteracted]);
	const zoomOut = useCallback(() => {
		markInteracted();
		setScale((value) => clampScale(value / ZOOM_FACTOR));
	}, [markInteracted]);
	const resetView = useCallback(() => applyFit(), [applyFit]);
	const toggleFullscreen = useCallback(() => setIsFullscreen((value) => !value), []);

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

	// 显示百分比相对适配尺寸：fit 时为 100%
	const pct = Math.round((scale / (fitScale || 1)) * 100);

	return (
		<div
			ref={containerRef}
			tabIndex={0}
			className={
				isFullscreen
					? "fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--background)] outline-none"
					: "relative flex flex-1 flex-col overflow-hidden bg-[var(--background)] outline-none"
			}
			onPointerDown={onPointerDown}
		>
			<div ref={viewportRef} className="relative flex-1 overflow-hidden">
				<div
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						width: naturalSize?.width,
						height: naturalSize?.height,
						transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
						transformOrigin: "0 0",
						willChange: "transform",
					}}
				>
					{children}
				</div>
			</div>

			<PreviewToolbar>
				<ToolbarButton label="−" title={t("zoom.out")} onClick={zoomOut} />
				<button
					type="button"
					onClick={resetView}
					title={t("zoom.reset")}
					className="min-w-14 text-center text-[12px] tabular-nums text-[var(--muted-foreground)]"
				>
					{pct}%
				</button>
				<ToolbarButton label="+" title={t("zoom.in")} onClick={zoomIn} />
				<div className="mx-1 h-4 w-px bg-[var(--border)]" />
				<ToolbarButton
					label={isFullscreen ? t("fullscreen.exit") : t("fullscreen.enter")}
					title={isFullscreen ? t("fullscreen.exit") : t("fullscreen.enter")}
					onClick={toggleFullscreen}
				/>
				{!autoFit && (
					<>
						<div className="mx-1 h-4 w-px bg-[var(--border)]" />
						<ToolbarButton label={t("view.reset")} title={t("view.resetTitle")} onClick={resetView} />
					</>
				)}
			</PreviewToolbar>
		</div>
	);
}
