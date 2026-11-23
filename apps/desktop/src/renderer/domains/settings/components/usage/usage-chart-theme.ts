import {
	ArcElement,
	BarController,
	BarElement,
	CategoryScale,
	Chart,
	DoughnutController,
	LinearScale,
	Tooltip,
} from "chart.js";

let registered = false;

/** Registers only the pieces the usage page draws, keeping chart.js tree-shaken. */
export function ensureUsageChartsRegistered(): void {
	if (registered) return;
	Chart.register(BarController, BarElement, CategoryScale, LinearScale, DoughnutController, ArcElement, Tooltip);
	registered = true;
}

/**
 * Series colours as CSS expressions over theme tokens, so DOM swatches and canvas charts agree and
 * follow theme switches. Canvas needs resolved values; see `resolveCssColors`.
 */
export const SERIES_COLOR_EXPRESSIONS = [
	"var(--primary)",
	"var(--chart-2)",
	"var(--chart-1)",
	"color-mix(in srgb, var(--primary) 45%, var(--chart-1))",
	"color-mix(in srgb, var(--chart-2) 50%, var(--foreground))",
	"color-mix(in srgb, var(--primary) 50%, var(--foreground))",
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
	fontFamily: string;
}

const CHROME_EXPRESSIONS = {
	text: "var(--foreground)",
	mutedText: "var(--muted-foreground)",
	grid: "color-mix(in srgb, var(--border) 70%, transparent)",
	tooltipBackground: "var(--popover)",
	tooltipText: "var(--popover-foreground)",
	tooltipBorder: "var(--border)",
} as const;

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
