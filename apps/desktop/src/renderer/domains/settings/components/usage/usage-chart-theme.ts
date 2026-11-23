import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from "chart.js";

let registered = false;

/** Registers only the pieces the usage page draws, keeping chart.js tree-shaken. */
export function ensureUsageChartsRegistered(): void {
	if (registered) return;
	Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);
	registered = true;
}

/**
 * Series colours as CSS expressions over theme tokens, so DOM swatches and canvas charts agree and
 * follow theme switches. Canvas needs resolved values; see `resolveCssColors`.
 */
export const SERIES_COLOR_EXPRESSIONS = [
	"var(--chart-2)",
	"var(--chart-1)",
	"var(--term-green)",
	"var(--term-magenta)",
	"var(--term-cyan)",
	"var(--term-red)",
] as const;

/** History without a model and the folded tail stay neutral so real models keep the accent colours. */
export const MUTED_SERIES_EXPRESSION = "color-mix(in srgb, var(--muted-foreground) 55%, transparent)";

export interface UsageChartChrome {
	text: string;
	mutedText: string;
	grid: string;
	tooltipBackground: string;
	tooltipText: string;
	tooltipBorder: string;
	/** Diagonal stripes behind each column, like an empty track. */
	hatch: string;
	cardBackground: string;
	fontFamily: string;
}

const CHROME_EXPRESSIONS = {
	text: "var(--foreground)",
	mutedText: "var(--muted-foreground)",
	grid: "color-mix(in srgb, var(--border) 70%, transparent)",
	tooltipBackground: "var(--popover)",
	tooltipText: "var(--popover-foreground)",
	tooltipBorder: "var(--border)",
	hatch: "color-mix(in srgb, var(--muted-foreground) 22%, transparent)",
	cardBackground: "var(--card)",
} as const;

/** CSS stripes for DOM surfaces that stand for "the rest", matching the canvas hatch. */
export const HATCH_BACKGROUND =
	"repeating-linear-gradient(-45deg, color-mix(in srgb, var(--muted-foreground) 30%, transparent) 0 1px, transparent 1px 5px)";

/** A 6px tile of 45° stripes; chart.js scales the context by DPR, so lines stay 1 CSS px. */
export function createHatchPattern(ctx: CanvasRenderingContext2D, color: string): CanvasPattern | string {
	const tile = document.createElement("canvas");
	tile.width = 6;
	tile.height = 6;
	const tileCtx = tile.getContext("2d");
	if (!tileCtx) return color;
	tileCtx.strokeStyle = color;
	tileCtx.lineWidth = 1;
	tileCtx.beginPath();
	tileCtx.moveTo(0, 6);
	tileCtx.lineTo(6, 0);
	tileCtx.moveTo(-1, 1);
	tileCtx.lineTo(1, -1);
	tileCtx.moveTo(5, 7);
	tileCtx.lineTo(7, 5);
	tileCtx.stroke();
	return ctx.createPattern(tile, "repeat") ?? color;
}

/** Resolves CSS colour expressions in the element's cascade; returns the input when resolution fails. */
export function resolveCssColors(host: Element, expressions: readonly string[]): string[] {
	const probe = document.createElement("span");
	probe.style.display = "none";
	host.appendChild(probe);
	try {
		return expressions.map((expression) => {
			probe.style.color = "";
			probe.style.color = expression;
			const resolved = getComputedStyle(probe).color;
			return resolved || expression;
		});
	} finally {
		probe.remove();
	}
}

export function resolveUsageChartChrome(host: Element): UsageChartChrome {
	const keys = Object.keys(CHROME_EXPRESSIONS) as Array<keyof typeof CHROME_EXPRESSIONS>;
	const colors = resolveCssColors(
		host,
		keys.map((key) => CHROME_EXPRESSIONS[key]),
	);
	const chrome = Object.fromEntries(keys.map((key, index) => [key, colors[index] ?? ""])) as Record<
		keyof typeof CHROME_EXPRESSIONS,
		string
	>;
	return { ...chrome, fontFamily: getComputedStyle(host).fontFamily || "system-ui" };
}
