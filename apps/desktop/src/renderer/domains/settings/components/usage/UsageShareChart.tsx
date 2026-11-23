import { Chart } from "chart.js";
import { useEffect, useRef } from "react";
import { ensureUsageChartsRegistered, resolveCssColors, resolveUsageChartChrome } from "./usage-chart-theme";

export interface UsageShareSlice {
	key: string;
	label: string;
	color: string;
	tokens: number;
}

export interface UsageShareChartProps {
	ariaLabel: string;
	slices: UsageShareSlice[];
	centerValue: string;
	centerCaption: string;
	formatTokens: (value: number) => string;
	formatShare: (share: number) => string;
	themeKey: string;
}

export function UsageShareChart({
	ariaLabel,
	slices,
	centerValue,
	centerCaption,
	formatTokens,
	formatShare,
	themeKey,
}: UsageShareChartProps): JSX.Element {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const chartRef = useRef<Chart<"doughnut"> | null>(null);
	const formatRef = useRef({ formatTokens, formatShare });
	formatRef.current = { formatTokens, formatShare };

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !canvas.getContext("2d")) return;
		ensureUsageChartsRegistered();
		const chart = new Chart(canvas, {
			type: "doughnut",
			data: { labels: [], datasets: [{ data: [] }] },
			options: {
				responsive: true,
				maintainAspectRatio: false,
				cutout: "74%",
				animation: { duration: 420, easing: "easeOutQuart" },
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
						bodyFont: { size: 12 },
						callbacks: {
							label: (item) => {
								const values = item.dataset.data as number[];
								const sum = values.reduce((total, value) => total + value, 0);
								const value = Number(item.raw);
								return ` ${item.label}  ${formatRef.current.formatTokens(value)} · ${formatRef.current.formatShare(sum > 0 ? value / sum : 0)}`;
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
			slices.map((slice) => slice.color),
		);
		chart.data.labels = slices.map((slice) => slice.label);
		chart.data.datasets = [
			{
				data: slices.map((slice) => slice.tokens),
				backgroundColor: colors,
				hoverBackgroundColor: colors,
				borderWidth: 0,
				spacing: slices.length > 1 ? 2 : 0,
				borderRadius: 4,
				hoverOffset: 4,
			},
		];
		chart.options.font = { family: chrome.fontFamily };
		const tooltip = chart.options.plugins?.tooltip;
		if (tooltip) {
			tooltip.backgroundColor = chrome.tooltipBackground;
			tooltip.bodyColor = chrome.tooltipText;
			tooltip.borderColor = chrome.tooltipBorder;
		}
		chart.update();
	}, [slices, themeKey]);

	return (
		<div className="relative mx-auto aspect-square w-full max-w-[188px]">
			<canvas ref={canvasRef} role="img" aria-label={ariaLabel} />
			<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
				<span className="text-[20px] font-semibold tabular-nums text-foreground">{centerValue}</span>
				<span className="text-[11px] text-muted-foreground">{centerCaption}</span>
			</div>
		</div>
	);
}
