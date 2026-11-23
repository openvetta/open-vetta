import { forwardRef, useLayoutEffect, useMemo, useRef, useState } from "react";
import { resolveCssColors } from "./usage-chart-theme";

export interface UsageTicketField {
	label: string;
	value: string;
}

export interface UsageTicketModel {
	fromLabel: string;
	toLabel: string;
	from: { big: string; sub: string };
	to: { big: string; sub: string };
	span: string;
	badge: string;
	/** Four headline numbers in the tinted band. */
	highlights: UsageTicketField[];
	/** Two rows of three fields under the band. */
	details: UsageTicketField[];
	meta: UsageTicketField[];
	/** One-day range: the header shows that date and the total instead of FROM → TO. */
	single: boolean;
	/** Right-hand header of a one-day ticket. */
	total: { big: string; sub: string };
	/** Small captions in the four corners of the backdrop. */
	corners: [string, string, string, string];
	serial: string;
	footer: string;
	fileName: string;
}

export const TICKET_WIDTH = 340;
export const TICKET_HEIGHT = 560;
/** The saved image is a poster: the ticket centred on a backdrop with corner captions. */
export const POSTER_WIDTH = 560;
export const POSTER_HEIGHT = 760;
const TICKET_X = (POSTER_WIDTH - TICKET_WIDTH) / 2;
const TICKET_Y = (POSTER_HEIGHT - TICKET_HEIGHT) / 2;
const CORNER = 28;
const PAD = 24;
const PERFORATION_Y = 360;
const NOTCH = 14;
const RADIUS = 18;

/**
 * The ticket is an inverted surface: light paper in the dark theme, dark paper in the light one.
 * Colours are resolved to concrete values because the SVG is also serialised into a PNG, where
 * CSS variables no longer resolve.
 */
const PALETTE_EXPRESSIONS = {
	paper: "color-mix(in srgb, var(--foreground) 94%, var(--background))",
	ink: "var(--background)",
	muted: "color-mix(in srgb, var(--background) 55%, var(--foreground))",
	faint: "color-mix(in srgb, var(--background) 25%, var(--foreground))",
	band: "color-mix(in srgb, var(--chart-2) 28%, color-mix(in srgb, var(--foreground) 94%, var(--background)))",
	accent: "var(--chart-2)",
	backdrop: "color-mix(in srgb, var(--background) 94%, var(--foreground))",
	caption: "color-mix(in srgb, var(--foreground) 45%, var(--background))",
} as const;

type Palette = Record<keyof typeof PALETTE_EXPRESSIONS, string>;

function ticketPath(): string {
	const w = TICKET_WIDTH;
	const h = TICKET_HEIGHT;
	const r = RADIUS;
	const n = NOTCH;
	const y = PERFORATION_Y;
	return [
		`M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r}`,
		`V ${y - n} A ${n} ${n} 0 0 0 ${w} ${y + n}`,
		`V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h}`,
		`H ${r} A ${r} ${r} 0 0 1 0 ${h - r}`,
		`V ${y + n} A ${n} ${n} 0 0 0 0 ${y - n}`,
		`V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`,
	].join(" ");
}

/** Deterministic bar widths from the serial, so the same usage always prints the same code. */
export function barcodeBars(seed: string, width: number): Array<{ x: number; w: number }> {
	let state = 2166136261;
	for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
	const next = () => {
		state = Math.imul(state ^ (state >>> 15), 2246822507);
		state = Math.imul(state ^ (state >>> 13), 3266489909);
		state ^= state >>> 16;
		return (state >>> 0) / 4294967296;
	};
	const bars: Array<{ x: number; w: number }> = [];
	let x = 0;
	while (x < width) {
		const w = 1 + Math.floor(next() * 3);
		if (x + w > width) break;
		bars.push({ x, w });
		x += w + 1 + Math.floor(next() * 2.5);
	}
	return bars;
}

/** Rough 10px text width: CJK glyphs are square, Latin ones about 0.6em. */
function estimateWidth(text: string, size: number): number {
	let width = 0;
	for (const char of text) width += /[\u3000-\u9fff\uff00-\uffef]/.test(char) ? size : size * 0.6;
	return width;
}

function clip(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function Field({
	field,
	x,
	y,
	anchor = "start",
	palette,
	size = 15,
	max = 18,
}: {
	field: UsageTicketField;
	x: number;
	y: number;
	anchor?: "start" | "middle" | "end";
	palette: Palette;
	size?: number;
	max?: number;
}): JSX.Element {
	return (
		<g>
			<text x={x} y={y} textAnchor={anchor} fontSize={10} fill={palette.muted}>
				{field.label}
			</text>
			<text x={x} y={y + size + 6} textAnchor={anchor} fontSize={size} fontWeight={700} fill={palette.ink}>
				{clip(field.value, max)}
			</text>
		</g>
	);
}

export const UsageTicket = forwardRef<SVGSVGElement, { ticket: UsageTicketModel; themeKey: string }>(
	function UsageTicket({ ticket, themeKey }, ref) {
		const hostRef = useRef<HTMLSpanElement>(null);
		const [palette, setPalette] = useState<Palette | null>(null);
		const [fontFamily, setFontFamily] = useState("system-ui, sans-serif");

		// biome-ignore lint/correctness/useExhaustiveDependencies: themeKey re-resolves the palette after a theme switch.
		useLayoutEffect(() => {
			const host = hostRef.current;
			if (!host) return;
			const keys = Object.keys(PALETTE_EXPRESSIONS) as Array<keyof Palette>;
			const colors = resolveCssColors(
				host,
				keys.map((key) => PALETTE_EXPRESSIONS[key]),
			);
			setPalette(Object.fromEntries(keys.map((key, index) => [key, colors[index] ?? ""])) as Palette);
			setFontFamily(getComputedStyle(host).fontFamily || "system-ui, sans-serif");
		}, [themeKey]);

		const bars = useMemo(() => barcodeBars(ticket.serial, TICKET_WIDTH - PAD * 2), [ticket.serial]);
		const w = TICKET_WIDTH;
		const mid = w / 2;
		const bandY = 136;
		const bandWidth = w - PAD * 2;
		const columnWidth = bandWidth / ticket.highlights.length;
		const badgeWidth = Math.max(60, estimateWidth(ticket.badge, 10) + 22);

		return (
			<span ref={hostRef} className="block">
				{palette && (
					<svg
						ref={ref}
						xmlns="http://www.w3.org/2000/svg"
						width={POSTER_WIDTH}
						height={POSTER_HEIGHT}
						viewBox={`0 0 ${POSTER_WIDTH} ${POSTER_HEIGHT}`}
						className="h-auto max-w-full"
						fontFamily={fontFamily}
						role="img"
						aria-label={`${ticket.from.big} – ${ticket.to.big} · ${ticket.highlights[0]?.value ?? ""}`}
					>
						<rect width={POSTER_WIDTH} height={POSTER_HEIGHT} fill={palette.backdrop} />
						{ticket.corners.map((caption, index) => (
							<text
								key={`${index}-${caption}`}
								x={index % 2 === 0 ? CORNER : POSTER_WIDTH - CORNER}
								y={index < 2 ? CORNER + 12 : POSTER_HEIGHT - CORNER}
								textAnchor={index % 2 === 0 ? "start" : "end"}
								fontSize={13}
								fill={palette.caption}
								letterSpacing={0.4}
							>
								{caption}
							</text>
						))}
						<g transform={`translate(${TICKET_X}, ${TICKET_Y})`}>
						<path d={ticketPath()} fill={palette.paper} />

						{ticket.single ? (
							<>
								<text x={PAD} y={34} fontSize={10} fill={palette.muted} letterSpacing={0.6}>
									{ticket.fromLabel}
								</text>
								<text x={w - PAD} y={34} fontSize={10} fill={palette.muted} textAnchor="end" letterSpacing={0.6}>
									{ticket.toLabel}
								</text>
								<line x1={PAD} x2={w - PAD} y1={46} y2={46} stroke={palette.faint} strokeDasharray="2 3" />
								<text x={PAD} y={92} fontSize={32} fontWeight={700} fill={palette.ink} letterSpacing={-0.5}>
									{ticket.from.big}
								</text>
								<text x={PAD} y={112} fontSize={11} fill={palette.muted}>
									{ticket.from.sub}
								</text>
								<text
									x={w - PAD}
									y={92}
									fontSize={32}
									fontWeight={700}
									fill={palette.ink}
									textAnchor="end"
									letterSpacing={-0.5}
								>
									{ticket.total.big}
								</text>
								<text x={w - PAD} y={112} fontSize={11} fill={palette.muted} textAnchor="end">
									{ticket.total.sub}
								</text>
								{ticket.badge && (
									<>
										<rect x={mid - badgeWidth / 2} y={68} width={badgeWidth} height={20} rx={10} fill={palette.ink} />
										<text x={mid} y={82} fontSize={10} fontWeight={600} fill={palette.paper} textAnchor="middle">
											{ticket.badge}
										</text>
									</>
								)}
							</>
						) : (
							<>
						{/* Route line: FROM ○ ···· ⚡ ···· ● TO */}
						<text x={PAD} y={34} fontSize={10} fill={palette.muted} letterSpacing={0.6}>
							{ticket.fromLabel}
						</text>
						<text x={w - PAD} y={34} fontSize={10} fill={palette.muted} textAnchor="end" letterSpacing={0.6}>
							{ticket.toLabel}
						</text>
						<circle cx={PAD + 42} cy={30.5} r={3.5} fill="none" stroke={palette.muted} strokeWidth={1.2} />
						<circle cx={w - PAD - 30} cy={30.5} r={3.5} fill={palette.muted} />
						<line
							x1={PAD + 50}
							x2={mid - 16}
							y1={30.5}
							y2={30.5}
							stroke={palette.faint}
							strokeDasharray="2 3"
						/>
						<line
							x1={mid + 16}
							x2={w - PAD - 38}
							y1={30.5}
							y2={30.5}
							stroke={palette.faint}
							strokeDasharray="2 3"
						/>
						<path
							d={`M ${mid + 2} ${21} L ${mid - 6} ${32} H ${mid} L ${mid - 2} ${40} L ${mid + 6} ${29} H ${mid} Z`}
							fill={palette.ink}
						/>

						{/* Dates */}
						<text x={PAD} y={84} fontSize={32} fontWeight={700} fill={palette.ink} letterSpacing={-0.5}>
							{ticket.from.big}
						</text>
						<text x={PAD} y={104} fontSize={11} fill={palette.muted}>
							{ticket.from.sub}
						</text>
						<text
							x={w - PAD}
							y={84}
							fontSize={32}
							fontWeight={700}
							fill={palette.ink}
							textAnchor="end"
							letterSpacing={-0.5}
						>
							{ticket.to.big}
						</text>
						<text x={w - PAD} y={104} fontSize={11} fill={palette.muted} textAnchor="end">
							{ticket.to.sub}
						</text>
						<text x={mid} y={64} fontSize={11} fill={palette.ink} textAnchor="middle">
							{ticket.span}
						</text>
						<rect x={mid - badgeWidth / 2} y={72} width={badgeWidth} height={20} rx={10} fill={palette.ink} />
						<text x={mid} y={86} fontSize={10} fontWeight={600} fill={palette.paper} textAnchor="middle">
							{ticket.badge}
						</text>

							</>
						)}

						{/* Headline band */}
						<rect x={PAD} y={bandY} width={bandWidth} height={64} rx={10} fill={palette.band} />
						{ticket.highlights.map((field, index) => (
							<Field
								key={field.label}
								field={field}
								x={PAD + 12 + index * columnWidth}
								y={bandY + 22}
								palette={palette}
								size={16}
								max={7}
							/>
						))}

						{ticket.details.map((field, index) => (
							<Field
								key={field.label}
								field={field}
								x={index === 0 ? PAD : index === 1 ? 206 : w - PAD}
								anchor={index === 2 ? "end" : "start"}
								y={230}
								palette={palette}
								max={index === 0 ? 20 : 8}
							/>
						))}
						{ticket.meta.map((field, index) => (
							<Field
								key={field.label}
								field={field}
								x={index === 0 ? PAD : index === 1 ? 206 : w - PAD}
								anchor={index === 2 ? "end" : "start"}
								y={290}
								palette={palette}
								size={13}
								max={index === 0 ? 22 : 10}
							/>
						))}

						{/* Perforation */}
						<line
							x1={NOTCH + 10}
							x2={w - NOTCH - 10}
							y1={PERFORATION_Y}
							y2={PERFORATION_Y}
							stroke={palette.faint}
							strokeDasharray="3 3"
						/>

						{/* Barcode */}
						<g transform={`translate(${PAD}, ${PERFORATION_Y + 34})`}>
							{bars.map((bar) => (
								<rect key={bar.x} x={bar.x} y={0} width={bar.w} height={88} fill={palette.ink} />
							))}
						</g>
						<text
							x={mid}
							y={PERFORATION_Y + 144}
							fontSize={10}
							fill={palette.ink}
							textAnchor="middle"
							letterSpacing={2.4}
							fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
						>
							{ticket.serial}
						</text>
						<text x={mid} y={TICKET_HEIGHT - 22} fontSize={9} fill={palette.muted} textAnchor="middle" letterSpacing={1.6}>
							{ticket.footer}
						</text>
						</g>
					</svg>
				)}
			</span>
		);
	},
);

/** Rasterises the ticket SVG to a PNG data URL at the given pixel ratio. */
export async function renderTicketPng(svg: SVGSVGElement, scale = 2): Promise<string> {
	const markup = new XMLSerializer().serializeToString(svg);
	const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
	try {
		const image = new Image();
		image.decoding = "async";
		image.src = url;
		await image.decode();
		const canvas = document.createElement("canvas");
		canvas.width = POSTER_WIDTH * scale;
		canvas.height = POSTER_HEIGHT * scale;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("canvas unavailable");
		ctx.scale(scale, scale);
		ctx.drawImage(image, 0, 0, POSTER_WIDTH, POSTER_HEIGHT);
		return canvas.toDataURL("image/png");
	} finally {
		URL.revokeObjectURL(url);
	}
}
