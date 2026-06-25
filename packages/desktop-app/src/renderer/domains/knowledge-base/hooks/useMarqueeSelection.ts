import { type RefObject, useCallback, useRef, useState } from "react";

export interface MarqueeRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

interface UseMarqueeSelectionParams {
	selectedIds: Set<string>;
	/** 框选：用最新的选中集合覆盖。 */
	onSelectIds: (ids: Set<string>) => void;
	/** 点击空白：清空选中。 */
	onClearSelection: () => void;
}

interface UseMarqueeSelectionResult {
	/** 挂在可滚动容器上，作为框选相交计算的坐标系。 */
	scrollRef: RefObject<HTMLDivElement | null>;
	/** 当前框选矩形（拖动中），用于渲染选框；松手为 null。 */
	marquee: MarqueeRect | null;
	onMouseDown: (event: React.MouseEvent) => void;
}

const DRAG_THRESHOLD = 4;

/**
 * 空白处按下拖动框选：实时计算与各 `[data-knode-id]` 子项的相交集合。
 * cmd/ctrl/shift 为追加模式（在原选中基础上叠加），否则先清空再框选。
 * 宫格与列表视图共用，子项布局不限，只需带 `data-knode` / `data-knode-id`。
 */
export function useMarqueeSelection({
	selectedIds,
	onSelectIds,
	onClearSelection,
}: UseMarqueeSelectionParams): UseMarqueeSelectionResult {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [marquee, setMarquee] = useState<MarqueeRect | null>(null);

	const onMouseDown = useCallback(
		(event: React.MouseEvent) => {
			if (event.button !== 0) return;
			const target = event.target as HTMLElement;
			// 点在某个 item 上时不触发框选，交给该 item 的 click 处理。
			if (target.closest("[data-knode]")) return;
			const container = scrollRef.current;
			if (!container) return;

			const cr = container.getBoundingClientRect();
			const toContent = (clientX: number, clientY: number) => ({
				x: clientX - cr.left + container.scrollLeft,
				y: clientY - cr.top + container.scrollTop,
			});
			const start = toContent(event.clientX, event.clientY);
			const additive = event.metaKey || event.ctrlKey || event.shiftKey;
			const base = additive ? new Set(selectedIds) : new Set<string>();
			if (!additive) onClearSelection();

			let moved = false;

			const onMove = (e: MouseEvent) => {
				const cur = toContent(e.clientX, e.clientY);
				const left = Math.min(start.x, cur.x);
				const top = Math.min(start.y, cur.y);
				const width = Math.abs(cur.x - start.x);
				const height = Math.abs(cur.y - start.y);
				if (!moved && width < DRAG_THRESHOLD && height < DRAG_THRESHOLD) return;
				moved = true;
				setMarquee({ left, top, width, height });

				const next = new Set(base);
				const right = left + width;
				const bottom = top + height;
				for (const el of container.querySelectorAll<HTMLElement>("[data-knode-id]")) {
					const ir = el.getBoundingClientRect();
					const ix = ir.left - cr.left + container.scrollLeft;
					const iy = ir.top - cr.top + container.scrollTop;
					const intersects = ix < right && ix + ir.width > left && iy < bottom && iy + ir.height > top;
					if (intersects) {
						const id = el.dataset.knodeId;
						if (id) next.add(id);
					}
				}
				onSelectIds(next);
			};

			const onUp = () => {
				window.removeEventListener("mousemove", onMove);
				window.removeEventListener("mouseup", onUp);
				setMarquee(null);
			};

			window.addEventListener("mousemove", onMove);
			window.addEventListener("mouseup", onUp);
		},
		[selectedIds, onSelectIds, onClearSelection],
	);

	return { scrollRef, marquee, onMouseDown };
}
