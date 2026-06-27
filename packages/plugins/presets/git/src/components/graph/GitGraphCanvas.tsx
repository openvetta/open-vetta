import { createGitgraph, MergeStyle, TemplateName, templateExtend } from "@gitgraph/js";
import { useTranslation } from "@vetta/plugin-sdk";
import { useLayoutEffect, useRef, useState } from "react";
import { toGit2Json } from "../../git/parseLog";
import type { CommitNode } from "../../git/types";
import { type HostMode, useHostMode } from "../hostTheme";
import { CommitRow } from "./CommitRow";

const DOT_SIZE = 5;
// Vertical pitch between dots; the HTML rows use the same height.
const ROW_HEIGHT = 24;
const HASH_RE = /^[0-9a-f]{7,40}$/;

// One lane color per column; tuned per theme for contrast on the host background.
const LANE_COLORS: Record<HostMode, string[]> = {
	dark: ["#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#22d3ee", "#fb923c", "#a3e635"],
	light: ["#2563eb", "#059669", "#d97706", "#db2777", "#7c3aed", "#0891b2", "#ea580c", "#65a30d"],
};

type Geom = { y: Record<string, number>; laneWidth: number; height: number };
const EMPTY_GEOM: Geom = { y: {}, laneWidth: 48, height: 0 };

// gitgraph draws only the railroad (dots + lane lines); subject text, refs, and
// badges are rendered as HTML rows, so its own message/branch-label are off.
function buildTemplate(mode: HostMode) {
	return templateExtend(TemplateName.Metro, {
		colors: LANE_COLORS[mode],
		branch: { lineWidth: 2, spacing: 13, mergeStyle: MergeStyle.Bezier, label: { display: false } },
		commit: {
			spacing: ROW_HEIGHT,
			hasTooltipInCompactMode: false,
			dot: { size: DOT_SIZE, strokeWidth: 0 },
			message: { display: false, displayAuthor: false, displayHash: false },
		},
	});
}

/**
 * Graph renderer: `@gitgraph/js` draws the lanes/dots into an absolutely-positioned
 * SVG; HTML {@link CommitRow}s are laid over it. Each row is pinned to its OWN dot's
 * measured Y (no ordering/spacing assumptions), so rows stay glued to their nodes
 * regardless of orientation. HTML rows make ellipsis, hover badges, ref chips, and
 * selection trivial.
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
	const scrollRef = useRef<HTMLDivElement>(null);
	const graphRef = useRef<HTMLDivElement>(null);
	const [geom, setGeom] = useState<Geom>(EMPTY_GEOM);

	useLayoutEffect(() => {
		const host = graphRef.current;
		const scroll = scrollRef.current;
		if (!host || !scroll) return;
		host.replaceChildren();
		setGeom(EMPTY_GEOM);
		if (nodes.length === 0) return;
		// Default orientation draws newest at the top (verified via core layout),
		// matching our newest-first `nodes` order.
		const graph = createGitgraph(host, { template: buildTemplate(mode) });
		graph.import(toGit2Json(nodes));

		// Measure every dot's own center Y (content coords) so each row pins to its
		// node. gitgraph re-renders asynchronously (offset recompute), so re-measure
		// on subtree change, coalesced via rAF.
		const measure = (): void => {
			const sRect = scroll.getBoundingClientRect();
			const originY = sRect.top - scroll.scrollTop;
			const y: Record<string, number> = {};
			let maxY = 0;
			let laneRight = sRect.left;
			for (const circle of Array.from(host.querySelectorAll("circle[id]"))) {
				const id = circle.getAttribute("id");
				if (!id || !HASH_RE.test(id)) continue;
				const dot = circle.closest("g");
				if (!dot) continue;
				const r = dot.getBoundingClientRect();
				const cy = r.top + r.height / 2 - originY;
				y[id] = cy;
				if (cy > maxY) maxY = cy;
				if (r.right > laneRight) laneRight = r.right;
			}
			const laneWidth = Math.ceil(laneRight - sRect.left) + 12;
			const height = maxY + ROW_HEIGHT;
			setGeom((prev) => {
				if (prev.laneWidth === laneWidth && prev.height === height && prev.y[nodes[0].hash] === y[nodes[0].hash]) return prev;
				return { y, laneWidth, height };
			});
		};

		let raf = 0;
		const observer = new MutationObserver(() => {
			if (raf) return;
			raf = requestAnimationFrame(() => {
				raf = 0;
				measure();
			});
		});
		observer.observe(host, { childList: true, subtree: true });
		measure();
		return () => {
			observer.disconnect();
			if (raf) cancelAnimationFrame(raf);
			host.replaceChildren();
		};
	}, [nodes, mode]);

	return (
		<div ref={scrollRef} className="git-graph-canvas relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
			<div ref={graphRef} className="pointer-events-none absolute left-0 top-0" />
			<div className="relative" style={{ height: nodes.length === 0 ? undefined : Math.max(geom.height, nodes.length * ROW_HEIGHT) }}>
				{nodes.map((node, i) => {
					// Before measurement (or if a dot is missing) fall back to index pitch.
					const center = geom.y[node.hash] ?? i * ROW_HEIGHT + ROW_HEIGHT / 2;
					return (
						<CommitRow
							key={node.hash}
							node={node}
							selected={node.hash === selectedHash}
							graphWidth={geom.laneWidth}
							top={center - ROW_HEIGHT / 2}
							height={ROW_HEIGHT}
							locale={locale}
							onSelect={onSelect}
						/>
					);
				})}
			</div>
		</div>
	);
}
