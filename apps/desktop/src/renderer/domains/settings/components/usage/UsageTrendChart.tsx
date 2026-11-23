import { Chart, type ChartDataset, type Plugin, type TooltipItem } from "chart.js";
import { useEffect, useRef } from "react";
import {
	createHatchPattern,
	ensureUsageChartsRegistered,
	resolveCssColors,
	resolveUsageChartChrome,
	type UsageChartChrome,
} from "./usage-chart-theme";

export interface UsageTrendChartDataset {
	key: string;
	label: string;
	/** CSS colour expression; resolved against the canvas' cascade. */
	color: string;
	values: number[];
}

export interface UsageTrendChartProps {
	ariaLabel: string;
	/** Short axis label per column. */
	columnLabels: string[];
	/** Tooltip heading per column. */
	columnTitles: string[];
	datasets: UsageTrendChartDataset[];
	formatTokens: (value: number) => string;
	totalLabel: string;
	/** Caption on the dashed average line. */
	averageLabel: string;
	/** Changes whenever theme tokens may have changed, so colours are re-resolved. */
	themeKey: string;
}

interface DecorState {
	chrome: UsageChartChrome | null;
	hatch: CanvasPattern | string;
	averageLabel: string;
	format: (value: number) => string;
}

interface BarGeometry {
	x: number;
	y: number;
	width: number;
}

function columnTotals(chart: Chart<"bar">): number[] {
	const totals: number[] = [];
	for (const dataset of chart.data.datasets) {
		dataset.data.forEach((value, index) => {
			totals[index] = (totals[index] ?? 0) + Number(value ?? 0);
		});
	}
	return totals;
}

/** Hatched tracks behind every column, a dashed average line, and a pill over the peak column. */
function createDecorPlugin(state: { current: DecorState }): Plugin<"bar"> {
	return {
		id: "usageTrendDecor",
		beforeDatasetsDraw(chart) {
			const meta = chart.getDatasetMeta(0);
			if (!meta || meta.data.length === 0) return;
			const { ctx, chartArea } = chart;
			ctx.save();
			ctx.fillStyle = state.current.hatch;
			for (const element of meta.data) {
				const { x, width } = element.getProps(["x", "width"], true) as unknown as BarGeometry;
				ctx.beginPath();
				ctx.roundRect(x - width / 2, chartArea.top, width, chartArea.bottom - chartArea.top, 6);
				ctx.fill();
			}
			ctx.restore();
		},
		afterDatasetsDraw(chart) {
			const chrome = state.current.chrome;
			const totals = columnTotals(chart);
			if (!chrome || totals.length < 2) return;
			const peak = Math.max(...totals);
			if (peak <= 0) return;
			const { ctx, chartArea, scales } = chart;
			const yScale = scales.y;
			if (!yScale) return;
			ctx.save();
			ctx.font = `600 11px ${chrome.fontFamily}`;
			ctx.textBaseline = "middle";

			const average = totals.reduce((sum, value) => sum + value, 0) / totals.length;
			if (average > 0 && average < peak) {
				const y = Math.round(yScale.getPixelForValue(average)) + 0.5;
				ctx.strokeStyle = chrome.mutedText;
				ctx.globalAlpha = 0.6;
				ctx.lineWidth = 1;
				ctx.setLineDash([4, 4]);
				ctx.beginPath();
				ctx.moveTo(chartArea.left, y);
				ctx.lineTo(chartArea.right, y);
				ctx.stroke();
				ctx.setLineDash([]);
				ctx.globalAlpha = 1;
				const text = `${state.current.averageLabel} ${state.current.format(average)}`;
				const width = ctx.measureText(text).width + 10;
				ctx.fillStyle = chrome.cardBackground;
				ctx.fillRect(chartArea.right - width, y - 8, width, 16);
				ctx.fillStyle = chrome.mutedText;
				ctx.textAlign = "right";
				ctx.fillText(text, chartArea.right - 4, y);
			}

			const peakIndex = totals.indexOf(peak);
			let top = chartArea.bottom;
			let x = 0;
			for (let datasetIndex = 0; datasetIndex < chart.data.datasets.length; datasetIndex += 1) {
				const element = chart.getDatasetMeta(datasetIndex).data[peakIndex];
				if (!element) continue;
				const props = element.getProps(["x", "y"], false) as unknown as BarGeometry;
				x = props.x;
				top = Math.min(top, props.y);
			}
			const text = `↑ ${state.current.format(peak)}`;
			const width = ctx.measureText(text).width + 14;
			const height = 18;
			const left = Math.min(Math.max(x - width / 2, chartArea.left), chartArea.right - width);
			const pillTop = Math.max(top - height - 6, 0);
			ctx.fillStyle = chrome.text;
			ctx.beginPath();
			ctx.roundRect(left, pillTop, width, height, 9);
			ctx.fill();
			ctx.fillStyle = chrome.cardBackground;
			ctx.textAlign = "center";
			ctx.fillText(text, left + width / 2, pillTop + height / 2 + 0.5);
			ctx.restore();
		},
	};
}

/**
 * Stacked token columns over hatched tracks. The chart instance is created once and updated in
 * place: rebuilding on every range switch would re-run layout and drop the transition between ranges.
 */
export function UsageTrendChart({
	ariaLabel,
	columnLabels,
	columnTitles,
	datasets,
	formatTokens,
	totalLabel,
	averageLabel,
	themeKey,
}: UsageTrendChartProps): JSX.Element {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const chartRef = useRef<Chart<"bar"> | null>(null);
	const formatRef = useRef(formatTokens);
	formatRef.current = formatTokens;
	const titlesRef = useRef(columnTitles);
	titlesRef.current = columnTitles;
	const totalLabelRef = useRef(totalLabel);
	totalLabelRef.current = totalLabel;
	const decorRef = useRef<DecorState>({ chrome: null, hatch: "transparent", averageLabel, format: formatTokens });
	decorRef.current.averageLabel = averageLabel;
	decorRef.current.format = formatTokens;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !canvas.getContext("2d")) return;
		ensureUsageChartsRegistered();
		const chart = new Chart(canvas, {
			type: "bar",
			data: { labels: [], datasets: [] },
			plugins: [createDecorPlugin(decorRef)],
			options: {
				responsive: true,
				maintainAspectRatio: false,
				animation: { duration: 360, easing: "easeOutQuart" },
				interaction: { mode: "index", intersect: false },
				layout: { padding: { top: 28 } },
				scales: {
					x: {
						stacked: true,
						grid: { display: false },
						border: { display: false },
						ticks: { autoSkip: true, maxRotation: 0, maxTicksLimit: 10, font: { size: 11 } },
					},
					y: {
						stacked: true,
						beginAtZero: true,
						grace: "8%",
						grid: { display: false },
						border: { display: false },
						ticks: {
							maxTicksLimit: 5,
							padding: 8,
							font: { size: 11 },
							callback: (value) => formatRef.current(Number(value)),
						},
					},
				},
				plugins: {
					legend: { display: false },
					tooltip: {
						padding: 10,
						cornerRadius: 8,
						borderWidth: 1,
						boxWidth: 8,
						boxHeight: 8,
						boxPadding: 4,
						usePointStyle: true,
						titleFont: { size: 12, weight: 600 },
						bodyFont: { size: 12 },
						footerFont: { size: 12, weight: 600 },
						filter: (item: TooltipItem<"bar">) => Number(item.raw) > 0,
						itemSort: (a: TooltipItem<"bar">, b: TooltipItem<"bar">) => Number(b.raw) - Number(a.raw),
						callbacks: {
							title: (items) => titlesRef.current[items[0]?.dataIndex ?? 0] ?? "",
							label: (item) => ` ${item.dataset.label ?? ""}  ${formatRef.current(Number(item.raw))}`,
							footer: (items) => {
								const sum = items.reduce((total, item) => total + Number(item.raw), 0);
								return `${totalLabelRef.current}  ${formatRef.current(sum)}`;
							},
						},
					},
				},
			},
		});
		chartRef.current = chart;
		return () => {
			chart.destroy();
			chartRef.current = null;
		};
	}, []);

	useEffect(() => {
		const chart = chartRef.current;
		const canvas = canvasRef.current;
		if (!chart || !canvas) return;
		const chrome = resolveUsageChartChrome(canvas);
		const colors = resolveCssColors(
			canvas,
			datasets.map((dataset) => dataset.color),
		);
		decorRef.current.chrome = chrome;
		decorRef.current.hatch = createHatchPattern(chart.ctx, chrome.hatch);
		const stacked = datasets.length > 1;
		chart.data.labels = columnLabels;
		const nextDatasets: ChartDataset<"bar", number[]>[] = datasets.map((dataset, index) => ({
			label: dataset.label,
			data: dataset.values,
			backgroundColor: colors[index],
			hoverBackgroundColor: colors[index],
			// A card-coloured top edge separates stacked segments without drawing a line.
			borderColor: chrome.cardBackground,
			borderWidth: stacked ? { top: 2, right: 0, bottom: 0, left: 0 } : 0,
			borderRadius: 6,
			borderSkipped: false,
			barPercentage: 0.8,
			categoryPercentage: 0.88,
			maxBarThickness: 32,
			stack: "tokens",
		}));
		chart.data.datasets = nextDatasets;
		const { scales, plugins } = chart.options;
		const x = scales?.x;
		const y = scales?.y;
		if (x?.ticks) x.ticks.color = chrome.mutedText;
		if (y?.ticks) y.ticks.color = chrome.mutedText;
		chart.options.font = { family: chrome.fontFamily };
		if (plugins?.tooltip) {
			plugins.tooltip.backgroundColor = chrome.tooltipBackground;
			plugins.tooltip.titleColor = chrome.tooltipText;
			plugins.tooltip.bodyColor = chrome.tooltipText;
			plugins.tooltip.footerColor = chrome.tooltipText;
			plugins.tooltip.borderColor = chrome.tooltipBorder;
		}
		chart.update();
	}, [columnLabels, datasets, themeKey]);

	return (
		<div className="relative h-[248px] w-full">
			<canvas ref={canvasRef} role="img" aria-label={ariaLabel} />
		</div>
	);
}
