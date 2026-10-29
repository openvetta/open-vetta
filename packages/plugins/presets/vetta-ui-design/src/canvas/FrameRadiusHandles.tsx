import { useTranslation } from "@vetta-org/plugin-sdk";
import { type CSSProperties, type PointerEvent as ReactPointerEvent, useRef, useState } from "react";

export type RadiusCorner = "nw" | "ne" | "sw" | "se";

const CORNERS: readonly RadiusCorner[] = ["nw", "ne", "sw", "se"];

/** 手柄至少离角这么远（屏幕像素），免得 0 圆角时叠在缩放手柄上。 */
const MIN_INSET_PX = 16;

/** 各角「往里」的方向：拖向 frame 中心 = 圆角变大。 */
const INWARD: Record<RadiusCorner, { x: 1 | -1; y: 1 | -1 }> = {
	nw: { x: 1, y: 1 },
	ne: { x: -1, y: 1 },
	sw: { x: 1, y: -1 },
	se: { x: -1, y: -1 },
};

/**
 * 拖拽换算：指针位移（屏幕像素）沿「往里」的对角方向取均值，除以缩放得到设计稿里的圆角变化量。
 * 结果钳在 [0, max]，取整——圆角是整数 px，label 和落盘的值才一致。
 */
export function radiusFromDrag(
	startRadius: number,
	corner: RadiusCorner,
	dxScreen: number,
	dyScreen: number,
	zoom: number,
	max: number,
): number {
	const inward = INWARD[corner];
	const delta = (dxScreen * inward.x + dyScreen * inward.y) / 2 / zoom;
	return Math.max(0, Math.min(Math.round(startRadius + delta), Math.floor(max)));
}

/** 手柄中心离角的距离（CSS 表达式）：圆角本身，但不小于最小间距（反向缩放后的屏幕像素）。 */
function insetOf(radius: number): string {
	return `max(${radius}px, calc(${MIN_INSET_PX}px * var(--vetd-lscale, 1)))`;
}

function placement(corner: RadiusCorner, radius: number): CSSProperties {
	const inset = insetOf(radius);
	const scale = "scale(var(--vetd-lscale, 1))";
	switch (corner) {
		case "nw":
			return { left: inset, top: inset, transform: `translate(-50%, -50%) ${scale}` };
		case "ne":
			return { right: inset, top: inset, transform: `translate(50%, -50%) ${scale}` };
		case "sw":
			return { left: inset, bottom: inset, transform: `translate(-50%, 50%) ${scale}` };
		case "se":
			return { right: inset, bottom: inset, transform: `translate(50%, 50%) ${scale}` };
	}
}

interface FrameRadiusHandlesProps {
	radius: number;
	/** 圆角上限：短边的一半。 */
	max: number;
	getZoom(): number;
	/** 拖拽中的实时值；松手后传 null 回到落盘值。 */
	onDraft(radius: number | null): void;
	onCommit(radius: number): void;
}

/**
 * 选中 frame 时四个角里的圆角手柄（Figma 的做法）：圆点落在离角「圆角」那么远的地方，朝
 * frame 中心拖就变大，四角一起变。悬停和拖拽时旁边浮出当前圆角数值。
 * 手柄在 frame 内侧，缩放手柄在角外侧，两者不抢位置。
 */
export function FrameRadiusHandles({ radius, max, getZoom, onDraft, onCommit }: FrameRadiusHandlesProps) {
	const { t } = useTranslation();
	const [hovered, setHovered] = useState<RadiusCorner | null>(null);
	const [dragging, setDragging] = useState<RadiusCorner | null>(null);
	const dragRef = useRef<{ pointerId: number; startX: number; startY: number; startRadius: number; last: number } | null>(
		null,
	);

	const begin = (event: ReactPointerEvent<HTMLElement>, corner: RadiusCorner): void => {
		if (event.button !== 0) return;
		// 不能冒泡：画布和 frame 自己都会把这次按下当成移动 / 框选。
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		dragRef.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			startRadius: radius,
			last: radius,
		};
		setDragging(corner);
	};

	const move = (event: ReactPointerEvent<HTMLElement>, corner: RadiusCorner): void => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		event.stopPropagation();
		const next = radiusFromDrag(
			drag.startRadius,
			corner,
			event.clientX - drag.startX,
			event.clientY - drag.startY,
			getZoom(),
			max,
		);
		drag.last = next;
		onDraft(next);
	};

	const end = (event: ReactPointerEvent<HTMLElement>): void => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		event.stopPropagation();
		dragRef.current = null;
		setDragging(null);
		onDraft(null);
		if (drag.last !== drag.startRadius) onCommit(drag.last);
	};

	return (
		<>
			{CORNERS.map((corner) => {
				const labelled = dragging === corner || (dragging === null && hovered === corner);
				const top = corner === "nw" || corner === "ne";
				return (
					// biome-ignore lint/a11y/noStaticElementInteractions: canvas manipulation handle
					<div
						key={corner}
						data-vetd-radius-handle={corner}
						className="absolute z-10 size-2.5 cursor-pointer rounded-full border border-[var(--vetd-selected)] bg-white shadow-sm transition-[box-shadow] hover:ring-4 hover:ring-primary/20"
						style={placement(corner, radius)}
						title={t("canvas.radius.hint")}
						onPointerDown={(event) => begin(event, corner)}
						onPointerMove={(event) => move(event, corner)}
						onPointerUp={end}
						onPointerCancel={end}
						onPointerEnter={() => setHovered(corner)}
						onPointerLeave={() => setHovered((current) => (current === corner ? null : current))}
					>
						{labelled ? (
							<span
								className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[4px] bg-primary px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums text-primary-foreground"
								style={top ? { top: "calc(100% + 6px)" } : { bottom: "calc(100% + 6px)" }}
							>
								{t("canvas.radius.label", { value: radius })}
							</span>
						) : null}
					</div>
				);
			})}
		</>
	);
}
