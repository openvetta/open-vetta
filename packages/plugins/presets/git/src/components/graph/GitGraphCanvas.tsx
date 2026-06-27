import { useTranslation } from "@vetta/plugin-sdk";
import { useMemo } from "react";
import { computeGraphLayout, type GraphLine } from "../../git/graphLayout";
import type { CommitNode } from "../../git/types";
import { type HostMode, useHostMode } from "../hostTheme";
import { CommitRow } from "./CommitRow";

// Geometry constants ported from Zed (crates/git_ui/src/git_graph.rs).
const ROW_HEIGHT = 24;
const LANE_WIDTH = 12;
const LEFT_PADDING = 12;
const CIRCLE_RADIUS = 3.5;
const CIRCLE_STROKE = 1.5;
const LINE_WIDTH = 1.5;
const CURVE_H = ROW_HEIGHT / 3;
const CURVE_W = LANE_WIDTH / 3;
// How far a line exits/enters a commit dot horizontally (Zed's column_shift).
const DOT_SHIFT = CIRCLE_RADIUS + CIRCLE_STROKE;
const ROW_GAP = 2;

// One lane color per column; tuned per theme for contrast on the host background.
const LANE_COLORS: Record<HostMode, string[]> = {
	dark: ["#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#22d3ee", "#fb923c", "#a3e635"],
	light: ["#2563eb", "#059669", "#d97706", "#db2777", "#7c3aed", "#0891b2", "#ea580c", "#65a30d"],
};
const COLORS_COUNT = LANE_COLORS.dark.length;

const laneCenterX = (lane: number): number => LEFT_PADDING + lane * LANE_WIDTH + LANE_WIDTH / 2;
const rowCenterY = (row: number): number => row * ROW_HEIGHT + ROW_HEIGHT / 2;

/** Build an SVG path for one edge, porting Zed's segment rendering geometry. */
function linePath(line: GraphLine): string {
	const startX = laneCenterX(line.childColumn);
	let curX = startX;
	let curY = rowCenterY(line.startRow) + CIRCLE_RADIUS;
	let d = `M${startX} ${curY}`;
	const segs = line.segments;

	segs.forEach((seg, i) => {
		const isLast = i === segs.length - 1;
		if (seg.kind === "straight") {
			let destY = rowCenterY(seg.toRow);
			if (isLast) destY -= CIRCLE_RADIUS;
			d += `L${curX} ${destY}`;
			curY = destY;
			return;
		}

		let toColX = laneCenterX(seg.toColumn);
		let toRowY = rowCenterY(seg.onRow);
		const goingRight = toColX > curX;
		const shift = goingRight ? DOT_SHIFT : -DOT_SHIFT;

		if (seg.curve === "checkout") {
			if (isLast) toColX -= shift;
			const cw = Math.min(CURVE_W, Math.abs(toColX - curX));
			const ch = Math.min(CURVE_H, Math.abs(toRowY - curY));
			const scw = goingRight ? cw : -cw;
			d += `L${curX} ${toRowY - ch}Q${curX} ${toRowY} ${curX + scw} ${toRowY}L${toColX} ${toRowY}`;
		} else {
			// merge
			if (isLast) toRowY -= CIRCLE_RADIUS;
			const msX = curX + shift;
			const msY = curY - CIRCLE_RADIUS;
			const cw = Math.min(CURVE_W, Math.abs(toColX - msX));
			const ch = Math.min(CURVE_H, Math.abs(toRowY - msY));
			const scw = goingRight ? cw : -cw;
			d += `M${msX} ${msY}L${toColX - scw} ${msY}Q${toColX} ${msY} ${toColX} ${msY + ch}L${toColX} ${toRowY}`;
		}
		curX = toColX;
		curY = toRowY;
	});

	return d;
}

/**
 * Graph renderer: a Zed-faithful swimlane layout ({@link computeGraphLayout})
 * drawn as SVG dots + edges, with HTML {@link CommitRow}s laid over it. Every
 * position is computed from row/lane (no DOM measurement), so rows stay glued to
 * their dots. Lanes free and get reused, keeping the graph compact.
 */
export function GitGraphCanvas({
	nodes,
	selectedHash,
	onSelect,
}: {
	nodes: readonly CommitNode[];
	selectedHash: string | null;
	onSelect: (hash: string) => void;
}): JSX.Element {
	const mode = useHostMode();
	const { locale } = useTranslation();
	const layout = useMemo(() => computeGraphLayout(nodes, COLORS_COUNT), [nodes]);

	const colors = LANE_COLORS[mode];
	const graphWidth = LEFT_PADDING + Math.max(1, layout.maxLanes) * LANE_WIDTH + ROW_GAP;
	const totalHeight = nodes.length * ROW_HEIGHT;

	return (
		<div className="git-graph-canvas relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
			<svg className="pointer-events-none absolute left-0 top-0" width={graphWidth} height={totalHeight} aria-hidden>
				<title>git graph</title>
				{layout.lines.map((line, i) => (
					<path
						// biome-ignore lint/suspicious/noArrayIndexKey: lines are positional and stable per layout
						key={i}
						d={linePath(line)}
						fill="none"
						stroke={colors[line.colorIdx % colors.length]}
						strokeWidth={LINE_WIDTH}
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				))}
				{layout.commits.map((c) => (
					<circle
						key={c.hash}
						cx={laneCenterX(c.lane)}
						cy={rowCenterY(c.row)}
						r={CIRCLE_RADIUS}
						fill={colors[c.colorIdx % colors.length]}
						stroke="var(--muted)"
						strokeWidth={1}
					/>
				))}
			</svg>
			<div className="relative" style={{ height: totalHeight }}>
				{nodes.map((node, i) => (
					<CommitRow
						key={node.hash}
						node={node}
						selected={node.hash === selectedHash}
						graphWidth={graphWidth}
						top={i * ROW_HEIGHT}
						height={ROW_HEIGHT}
						locale={locale}
						onSelect={onSelect}
					/>
				))}
			</div>
		</div>
	);
}
