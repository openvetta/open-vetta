import type { FilePreviewItem } from "@shared/store/atoms";
import { useCallback, useEffect, useRef, useState } from "react";
import { getExtension } from "./PreviewContent";

const MIME_MAP: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	svg: "image/svg+xml",
	ico: "image/x-icon",
};

const MIN_SCALE = 0.2;
const MAX_SCALE = 40;
const WHEEL_FACTOR = 0.0015;
// 上滑拖拽超过此距离（向上为负）松手即关闭
const CLOSE_THRESHOLD = 120;

/** 把预览项解析为可直接用于 <img src> 的字符串（url 直连 / 本地 readFile→dataurl）。 */
export function useImageSrc(item: FilePreviewItem): { src: string; error: boolean } {
	const [src, setSrc] = useState("");
	const [error, setError] = useState(false);
	useEffect(() => {
		setSrc("");
		setError(false);
		let cancelled = false;
		if (item.url) {
			setSrc(item.url);
			return;
		}
		if (!item.path) {
			setError(true);
			return;
		}
		void window.vetta.fs
			.readFile(item.path)
			.then(({ content, encoding }) => {
				if (cancelled) return;
				const mime = MIME_MAP[getExtension(item.name)] ?? "image/png";
				setSrc(encoding === "base64" ? `data:${mime};base64,${content}` : content);
			})
			.catch(() => {
				if (!cancelled) setError(true);
			});
		return () => {
			cancelled = true;
		};
	}, [item]);
	return { src, error };
}

interface LightboxImageProps {
	item: FilePreviewItem;
	onClose: () => void;
}

/**
 * 灯箱图片视图：直接滚轮缩放、缩放后拖拽平移、原比例下上滑拖拽淡出关闭。
 * 由 FilePreviewDialog 以 key=当前图 重挂载，因此内部状态无需跨图重置。
 */
export function LightboxImage({ item, onClose }: LightboxImageProps): JSX.Element {
	const containerRef = useRef<HTMLDivElement>(null);
	const { src, error } = useImageSrc(item);
	const [scale, setScale] = useState(1);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	// 上滑关闭手势的垂直位移（仅原比例下生效）
	const [dragY, setDragY] = useState(0);
	const [dragging, setDragging] = useState(false);
	const panStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

	// 无级滚轮缩放，以光标为中心；缩回原比例时复位平移
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const rect = container.getBoundingClientRect();
			const cx = e.clientX - rect.left - rect.width / 2;
			const cy = e.clientY - rect.top - rect.height / 2;
			setScale((prev) => {
				const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev - e.deltaY * WHEEL_FACTOR * prev));
				if (next === prev) return prev;
				if (next <= 1) {
					// 原比例及更小：居中显示，平移交还给上滑关闭手势
					setOffset({ x: 0, y: 0 });
				} else {
					const ratio = next / prev;
					setOffset((o) => ({ x: cx - ratio * (cx - o.x), y: cy - ratio * (cy - o.y) }));
				}
				return next;
			});
		};
		container.addEventListener("wheel", onWheel, { passive: false });
		return () => container.removeEventListener("wheel", onWheel);
	}, []);

	const onPointerDown = useCallback(
		(e: React.PointerEvent) => {
			if (e.button !== 0) return;
			e.preventDefault();
			setDragging(true);
			panStartRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
			(e.target as HTMLElement).setPointerCapture?.(e.pointerId);
		},
		[offset],
	);

	const onPointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (!dragging) return;
			const dx = e.clientX - panStartRef.current.x;
			const dy = e.clientY - panStartRef.current.y;
			if (scale > 1) {
				setOffset({ x: panStartRef.current.ox + dx, y: panStartRef.current.oy + dy });
			} else {
				setDragY(dy);
			}
		},
		[dragging, scale],
	);

	const onPointerUp = useCallback(() => {
		setDragging(false);
		if (scale <= 1) {
			if (dragY < -CLOSE_THRESHOLD) {
				onClose();
			} else {
				setDragY(0);
			}
		}
	}, [scale, dragY, onClose]);

	// 缩放以光标为中心，offset 已含平移量；原比例及更小时 offset 复位为 0，由 dragY 接管上滑关闭
	const tx = offset.x;
	const ty = offset.y + (scale <= 1 ? dragY : 0);
	// 上滑越远越淡，最多淡到 0.2
	const opacity = scale <= 1 ? 1 - Math.min(Math.abs(dragY) / 500, 0.8) : 1;

	return (
		<div
			ref={containerRef}
			className="flex h-full w-full items-center justify-center overflow-hidden"
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerUp}
		>
			{error ? (
				<div className="flex flex-col items-center gap-3 text-white/50">
					<span className="icon-[mdi--image-broken-variant] text-[40px]" />
					<span className="text-[13px]">无法加载此图片</span>
				</div>
			) : (
				src && (
					<img
						src={src}
						alt={item.name}
						draggable={false}
						onClick={(e) => e.stopPropagation()}
						style={{
							transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
							opacity,
							transition: dragging ? "none" : "transform 0.25s ease-out, opacity 0.25s ease-out",
							cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "default",
						}}
						className="max-h-[80%] max-w-full select-none object-contain"
					/>
				)
			)}
		</div>
	);
}
