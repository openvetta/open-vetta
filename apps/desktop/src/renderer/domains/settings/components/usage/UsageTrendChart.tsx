import { Chart, type ChartDataset, type TooltipItem } from "chart.js";
import { useEffect, useRef } from "react";
import { ensureUsageChartsRegistered, resolveCssColors, resolveUsageChartChrome } from "./usage-chart-theme";

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
	/** Changes whenever theme tokens may have changed, so colours are re-resolved. */
	themeKey: string;
}

/**
 * Stacked token columns. The chart instance is created once and updated in place: rebuilding on
 * every range switch would re-run layout and drop the transition between ranges.
 */
export function UsageTrendChart({
	ariaLabel,
	columnLabels,
	columnTitles,
	datasets,
	formatTokens,
	totalLabel,
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

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !canvas.getContext("2d")) return;
		ensureUsageChartsRegistered();
		const chart = new Chart(canvas, {
			type: "bar",
			data: { labels: [], datasets: [] },
			options: {
				responsive: true,
				maintainAspectRatio: false,
				animation: { duration: 360, easing: "easeOutQuart" },
				interaction: { mode: "index", intersect: false },
				layout: { padding: { top: 4 } },
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
		chart.data.labels = columnLabels;
		const nextDatasets: ChartDataset<"bar", number[]>[] = datasets.map((dataset, index) => ({
			label: dataset.label,
			data: dataset.values,
			backgroundColor: colors[index],
			hoverBackgroundColor: colors[index],
			borderRadius: 3,
			borderSkipped: false,
			borderWidth: 0,
			barPercentage: 0.72,
			categoryPercentage: 0.86,
			maxBarThickness: 28,
			stack: "tokens",
		}));
		chart.data.datasets = nextDatasets;
		const { scales, plugins } = chart.options;
		const x = scales?.x;
		const y = scales?.y;
		if (x?.ticks) x.ticks.color = chrome.mutedText;
		if (y?.ticks) y.ticks.color = chrome.mutedText;
		if (y?.grid) y.grid.color = chrome.grid;
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
		<div className="relative h-[232px] w-full">
			<canvas ref={canvasRef} role="img" aria-label={ariaLabel} />
		</div>
	);
}
