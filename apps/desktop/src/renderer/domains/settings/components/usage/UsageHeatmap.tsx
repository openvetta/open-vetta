import { cn } from "@shared/lib/utils";
import { memo, useCallback, useRef, useState, type MouseEvent } from "react";
import type { HeatmapCell, UsageHeatmap as UsageHeatmapData } from "./usage-aggregation";

const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const LABEL_WIDTH = 30;
const MONTH_ROW = 16;

const LEVEL_CLASS: Record<HeatmapCell["level"], string> = {
	0: "fill-muted-foreground/10",
	1: "fill-[color-mix(in_srgb,var(--term-green)_25%,transparent)]",
	2: "fill-[color-mix(in_srgb,var(--term-green)_50%,transparent)]",
	3: "fill-[color-mix(in_srgb,var(--term-green)_75%,transparent)]",
	4: "fill-[var(--term-green)]",
};

export interface UsageHeatmapLabels {
	ariaLabel: string;
	less: string;
	more: string;
	hint: string;
	/** Labels for Monday, Wednesday and Friday rows. */
	weekdays: [string, string, string];
	monthLabel: (day: string) => string;
	cellLabel: (cell: HeatmapCell) => string;
}

export interface UsageHeatmapProps {
	heatmap: UsageHeatmapData;
	labels: UsageHeatmapLabels;
	onSelectDay: (day: string) => void;
}

interface HoverState {
	cell: HeatmapCell;
	left: number;
	top: number;
}

const HeatmapCells = memo(function HeatmapCells({ weeks }: { weeks: HeatmapCell[][] }): JSX.Element {
	return (
		<g transform={`translate(${LABEL_WIDTH}, ${MONTH_ROW})`}>
			{weeks.map((column, week) =>
				column.map((cell, weekday) =>
					cell.future ? null : (
						<rect
							key={cell.day}
							data-day={cell.day}
							data-week={week}
							data-weekday={weekday}
							x={week * STEP}
							y={weekday * STEP}
							width={CELL}
							height={CELL}
							rx={2.5}
							className={cn(
								"cursor-pointer transition-opacity duration-150 hover:opacity-80",
								LEVEL_CLASS[cell.level],
								cell.inRange && "stroke-foreground/40",
							)}
							strokeWidth={cell.inRange ? 1 : 0}
						/>
					),
				),
			)}
		</g>
	);
});

export function UsageHeatmap({ heatmap, labels, onSelectDay }: UsageHeatmapProps): JSX.Element {
	const containerRef = useRef<HTMLDivElement>(null);
	const [hover, setHover] = useState<HoverState | null>(null);
	const width = LABEL_WIDTH + heatmap.weeks.length * STEP - GAP;
	const height = MONTH_ROW + 7 * STEP - GAP;

	const cellFromEvent = useCallback(
		(target: EventTarget): { cell: HeatmapCell; element: Element } | null => {
			if (!(target instanceof Element)) return null;
			const week = Number(target.getAttribute("data-week"));
			const weekday = Number(target.getAttribute("data-weekday"));
			const cell = heatmap.weeks[week]?.[weekday];
			return cell && target.hasAttribute("data-day") ? { cell, element: target } : null;
		},
		[heatmap],
	);

	const onMouseMove = useCallback(
		(event: MouseEvent<SVGSVGElement>) => {
			const hit = cellFromEvent(event.target);
			const container = containerRef.current;
			if (!hit || !container) {
				setHover(null);
				return;
			}
			if (hover?.cell.day === hit.cell.day) return;
			const cellRect = hit.element.getBoundingClientRect();
			const hostRect = container.getBoundingClientRect();
			setHover({
				cell: hit.cell,
				left: cellRect.left - hostRect.left + cellRect.width / 2,
				top: cellRect.top - hostRect.top,
			});
		},
		[cellFromEvent, hover],
	);

	const onClick = useCallback(
		(event: MouseEvent<SVGSVGElement>) => {
			const hit = cellFromEvent(event.target);
			if (hit) onSelectDay(hit.cell.day);
		},
		[cellFromEvent, onSelectDay],
	);

	return (
		<div ref={containerRef} className="relative">
			<svg
				viewBox={`0 0 ${width} ${height}`}
				className="block h-auto w-full select-none"
				role="img"
				aria-label={labels.ariaLabel}
				onMouseMove={onMouseMove}
				onMouseLeave={() => setHover(null)}
				onClick={onClick}
			>
				{heatmap.monthStarts.map(({ week, day }) => (
					<text
						key={day}
						x={LABEL_WIDTH + week * STEP}
						y={10}
						className="fill-muted-foreground text-[10px]"
					>
						{labels.monthLabel(day)}
					</text>
				))}
				{labels.weekdays.map((label, index) => (
					<text
						key={label}
						x={0}
						y={MONTH_ROW + (index * 2 + 1) * STEP + CELL - 2}
						className="fill-muted-foreground text-[10px]"
					>
						{label}
					</text>
				))}
				<HeatmapCells weeks={heatmap.weeks} />
			</svg>
			{hover && (
				<div
					role="tooltip"
					className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] text-popover-foreground shadow-md"
					style={{ left: hover.left, top: hover.top - 6 }}
				>
					{labels.cellLabel(hover.cell)}
				</div>
			)}
			<div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
				<span className="mr-auto text-muted-foreground/70">{labels.hint}</span>
				<span>{labels.less}</span>
				{([0, 1, 2, 3, 4] as const).map((level) => (
					<svg key={level} width={CELL} height={CELL} aria-hidden="true">
						<rect width={CELL} height={CELL} rx={2.5} className={LEVEL_CLASS[level]} />
					</svg>
				))}
				<span>{labels.more}</span>
			</div>
		</div>
	);
}
