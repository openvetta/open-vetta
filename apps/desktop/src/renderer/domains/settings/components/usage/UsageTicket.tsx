import { forwardRef, useEffect, useId, useMemo, useState } from "react";

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
	/** Headline numbers in the tinted band, spread evenly across it. */
	highlights: UsageTicketField[];
	/** Two rows of three fields under the band. */
	details: UsageTicketField[];
	meta: UsageTicketField[];
	/** Per-model list under the six fields; at most five rows, already folded into "other". */
	models: { label: string; rows: Array<{ name: string; value: string; share: string }> };
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
/** The saved image is a poster: the ticket centred on a backdrop with corner captions. */
export const POSTER_WIDTH = 560;
const TICKET_X = (POSTER_WIDTH - TICKET_WIDTH) / 2;
/** Backdrop above and below the ticket. */
const POSTER_MARGIN = 100;
const CORNER = 28;
const PAD = 24;
/**
 * Values in the first column under the band ellipsise before reaching the centred middle one;
 * wide enough for "23:00–24:00", the longest peak-hour range.
 */
const DETAIL_FIRST_WIDTH = TICKET_WIDTH / 2 - PAD - 34;
/** Baseline of the model list's caption, under the second row of fields. */
const MODEL_LIST_Y = 340;
const MODEL_ROW_FIRST = 370;
const MODEL_ROW_STEP = 20;
/** Right edge of the token column in the model list; the share sits at the ticket's right padding. */
const MODEL_VALUE_X = TICKET_WIDTH - PAD - 56;
/** Perforation of a ticket with no model rows; each row pushes it down. */
const BASE_PERFORATION_Y = 360;
/** Stub under the perforation: barcode, serial and footer. */
const STUB_HEIGHT = 200;
const NOTCH = 14;
const RADIUS = 18;

/**
 * Fixed print colours. The ticket is an image people save and share, so it must look the same in
 * every theme and appearance; it deliberately does not read theme tokens.
 */
const TICKET_PALETTE = {
	paper: "rgb(255, 255, 255)",
	ink: "rgb(17, 17, 17)",
	muted: "rgb(118, 118, 118)",
	faint: "rgb(190, 190, 190)",
	band: "rgb(236, 241, 249)",
	bandLabel: "rgb(78, 86, 102)",
	backdrop: "rgb(30, 30, 30)",
	caption: "rgb(140, 140, 140)",
} as const;

type Palette = typeof TICKET_PALETTE;

const TICKET_FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", "Microsoft YaHei", sans-serif';

/** The packaged app icon (same file the window uses). */
const BRAND_ICON_URL = "./icon.png";

/**
 * The icon as a data URL: an SVG rasterised from a blob cannot fetch external images, so the
 * export would silently drop a plain `href`. Null while loading or when the file is unavailable.
 */
function useBrandIconDataUrl(): string | null {
	const [dataUrl, setDataUrl] = useState<string | null>(null);
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const response = await fetch(BRAND_ICON_URL);
				if (!response.ok) return;
				const blob = await response.blob();
				const reader = new FileReader();
				reader.onload = () => {
					if (!cancelled && typeof reader.result === "string") setDataUrl(reader.result);
				};
				reader.readAsDataURL(blob);
			} catch {
				// No icon: the ticket falls back to the bolt glyph.
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);
	return dataUrl;
}

function BrandIcon({ href, x, y, size, clipId }: { href: string; x: number; y: number; size: number; clipId: string }): JSX.Element {
	return (
		<g>
			<clipPath id={clipId}>
				<rect x={x} y={y} width={size} height={size} rx={size * 0.24} />
			</clipPath>
			<image href={href} x={x} y={y} width={size} height={size} clipPath={`url(#${clipId})`} />
		</g>
	);
}

export interface TicketLayout {
	perforationY: number;
	ticketHeight: number;
	posterHeight: number;
}

/** The ticket grows with its model list, so the poster's height depends on the row count. */
export function ticketLayout(modelRows: number): TicketLayout {
	const perforationY =
		modelRows > 0 ? MODEL_ROW_FIRST + (modelRows - 1) * MODEL_ROW_STEP + 30 : BASE_PERFORATION_Y;
	const ticketHeight = perforationY + STUB_HEIGHT;
	return { perforationY, ticketHeight, posterHeight: ticketHeight + POSTER_MARGIN * 2 };
}

function ticketPath({ perforationY, ticketHeight }: TicketLayout): string {
	const w = TICKET_WIDTH;
	const h = ticketHeight;
	const r = RADIUS;
	const n = NOTCH;
	const y = perforationY;
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

/** Largest font size (up to `max`) at which bold `text` fits in `width`. */
function fitFontSize(text: string, max: number, width: number, min = 12): number {
	// Bold digits run a little wider than the regular estimate.
	const unit = estimateWidth(text, 1) * 1.08;
	return unit > 0 ? Math.max(min, Math.min(max, Math.floor(width / unit))) : max;
}

/** Cuts `text` with an ellipsis so bold text at `size` stays within `width`. */
function clipToWidth(text: string, size: number, width: number): string {
	const bold = 1.08;
	if (estimateWidth(text, size) * bold <= width) return text;
	let cut = text;
	while (cut.length > 1 && estimateWidth(`${cut}…`, size) * bold > width) cut = cut.slice(0, -1);
	return `${cut.trimEnd()}…`;
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
	fitWidth,
	clipWidth,
	labelColor,
}: {
	field: UsageTicketField;
	x: number;
	y: number;
	anchor?: "start" | "middle" | "end";
	palette: Palette;
	size?: number;
	max?: number;
	/** Shrink the value's font instead of overflowing this width. */
	fitWidth?: number;
	/** Ellipsise the value at this width instead of a fixed character count. */
	clipWidth?: number;
	labelColor?: string;
}): JSX.Element {
	const value = clipWidth ? clipToWidth(field.value, size, clipWidth) : clip(field.value, max);
	const valueSize = fitWidth ? fitFontSize(value, size, fitWidth) : size;
	return (
		<g>
			<text x={x} y={y} textAnchor={anchor} fontSize={10} fill={labelColor ?? palette.muted}>
				{field.label}
			</text>
			<text x={x} y={y + size + 6} textAnchor={anchor} fontSize={valueSize} fontWeight={700} fill={palette.ink}>
				{value}
			</text>
		</g>
	);
}

export const UsageTicket = forwardRef<SVGSVGElement, { ticket: UsageTicketModel }>(
	function UsageTicket({ ticket }, ref) {
		const palette = TICKET_PALETTE;
		const layout = ticketLayout(ticket.models.rows.length);
		const { perforationY, ticketHeight, posterHeight } = layout;

		const iconHref = useBrandIconDataUrl();
		const clipBase = useId().replace(/[^a-zA-Z0-9_-]/g, "");
		const bars = useMemo(() => barcodeBars(ticket.serial, TICKET_WIDTH - PAD * 2), [ticket.serial]);
		const w = TICKET_WIDTH;
		const mid = w / 2;
		const bandY = 136;
		const bandWidth = w - PAD * 2;
		const columnWidth = bandWidth / ticket.highlights.length;
		const totalSize = fitFontSize(
			ticket.total.big,
			32,
			TICKET_WIDTH - PAD * 2 - estimateWidth(ticket.from.big, 32) - 28,
		);
		// The pill sits between the two big dates; shrink its text rather than touch them.
		const badgeGap = TICKET_WIDTH - PAD * 2 - estimateWidth(ticket.from.big, 32) - estimateWidth(ticket.to.big, 32) - 20;
		const badgeFont = fitFontSize(ticket.badge, 10, badgeGap - 20, 8);
		const badgeWidth = Math.min(badgeGap, Math.max(60, estimateWidth(ticket.badge, badgeFont) + 20));

		return (
			<span className="block">
				{(
					<svg
						ref={ref}
						xmlns="http://www.w3.org/2000/svg"
						width={POSTER_WIDTH}
						height={posterHeight}
						viewBox={`0 0 ${POSTER_WIDTH} ${posterHeight}`}
						className="h-auto max-w-full"
						fontFamily={TICKET_FONT}
						role="img"
						aria-label={`${ticket.from.big} – ${ticket.to.big} · ${ticket.highlights[0]?.value ?? ""}`}
					>
						<rect width={POSTER_WIDTH} height={posterHeight} fill={palette.backdrop} />
						{iconHref && (
							<BrandIcon href={iconHref} x={CORNER} y={CORNER - 4} size={22} clipId={`${clipBase}-corner`} />
						)}
						{ticket.corners.map((caption, index) => (
							<text
								key={`${index}-${caption}`}
								x={index === 0 && iconHref ? CORNER + 30 : index % 2 === 0 ? CORNER : POSTER_WIDTH - CORNER}
								y={index < 2 ? CORNER + 12 : posterHeight - CORNER}
								textAnchor={index % 2 === 0 ? "start" : "end"}
								fontSize={13}
								fill={palette.caption}
								letterSpacing={0.4}
							>
								{caption}
							</text>
						))}
						<g transform={`translate(${TICKET_X}, ${POSTER_MARGIN})`}>
						<path d={ticketPath(layout)} fill={palette.paper} />

						{ticket.single ? (
							<>
								<text x={PAD} y={34} fontSize={10} fill={palette.muted} letterSpacing={0.6}>
									{ticket.fromLabel}
								</text>
								<text x={w - PAD} y={34} fontSize={10} fill={palette.muted} textAnchor="end" letterSpacing={0.6}>
									{ticket.toLabel}
								</text>
								<line x1={PAD} x2={w - PAD} y1={46} y2={46} stroke={palette.faint} strokeDasharray="2 3" />
								{iconHref && (
									<>
										<rect x={mid - 17} y={30} width={34} height={32} fill={palette.paper} />
										<BrandIcon href={iconHref} x={mid - 12} y={34} size={24} clipId={`${clipBase}-date`} />
									</>
								)}
								<text x={PAD} y={92} fontSize={32} fontWeight={700} fill={palette.ink} letterSpacing={-0.5}>
									{ticket.from.big}
								</text>
								<text x={PAD} y={112} fontSize={11} fill={palette.muted}>
									{ticket.from.sub}
								</text>
								<text
									x={w - PAD}
									y={92}
									fontSize={totalSize}
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
						{iconHref ? (
							<BrandIcon href={iconHref} x={mid - 12} y={18.5} size={24} clipId={`${clipBase}-route`} />
						) : (
							<path
								d={`M ${mid + 2} ${21} L ${mid - 6} ${32} H ${mid} L ${mid - 2} ${40} L ${mid + 6} ${29} H ${mid} Z`}
								fill={palette.ink}
							/>
						)}

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
						<text x={mid} y={86} fontSize={badgeFont} fontWeight={600} fill={palette.paper} textAnchor="middle">
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
								x={PAD + (index + 0.5) * columnWidth}
								anchor="middle"
								y={bandY + 22}
								palette={palette}
								size={18}
								max={8}
								fitWidth={columnWidth - 16}
								labelColor={palette.bandLabel}
							/>
						))}

						{ticket.details.map((field, index) => (
							<Field
								key={field.label}
								field={field}
								x={index === 0 ? PAD : index === 1 ? mid : w - PAD}
								anchor={index === 0 ? "start" : index === 1 ? "middle" : "end"}
								y={230}
								palette={palette}
								max={8}
								clipWidth={index === 0 ? DETAIL_FIRST_WIDTH : undefined}
							/>
						))}
						{ticket.meta.map((field, index) => (
							<Field
								key={field.label}
								field={field}
								x={index === 0 ? PAD : index === 1 ? mid : w - PAD}
								anchor={index === 0 ? "start" : index === 1 ? "middle" : "end"}
								y={290}
								palette={palette}
								size={13}
								max={10}
								clipWidth={index === 0 ? DETAIL_FIRST_WIDTH : undefined}
							/>
						))}

						{ticket.models.rows.length > 0 && (
							<g>
								<text x={PAD} y={MODEL_LIST_Y} fontSize={10} fill={palette.muted}>
									{ticket.models.label}
								</text>
								<line
									x1={PAD}
									x2={w - PAD}
									y1={MODEL_LIST_Y + 7}
									y2={MODEL_LIST_Y + 7}
									stroke={palette.faint}
									strokeDasharray="2 3"
								/>
								{ticket.models.rows.map((row, index) => {
									const y = MODEL_ROW_FIRST + index * MODEL_ROW_STEP;
									return (
										<g key={`${index}-${row.name}`}>
											<text x={PAD} y={y} fontSize={12} fontWeight={600} fill={palette.ink}>
												{clipToWidth(row.name, 12, MODEL_VALUE_X - PAD - 24)}
											</text>
											<text x={MODEL_VALUE_X} y={y} fontSize={12} fill={palette.muted} textAnchor="end">
												{row.value}
											</text>
											<text x={w - PAD} y={y} fontSize={12} fontWeight={600} fill={palette.ink} textAnchor="end">
												{row.share}
											</text>
										</g>
									);
								})}
							</g>
						)}

						{/* Perforation */}
						<line
							x1={NOTCH + 10}
							x2={w - NOTCH - 10}
							y1={perforationY}
							y2={perforationY}
							stroke={palette.faint}
							strokeDasharray="3 3"
						/>

						{/* Barcode */}
						<g transform={`translate(${PAD}, ${perforationY + 34})`}>
							{bars.map((bar) => (
								<rect key={bar.x} x={bar.x} y={0} width={bar.w} height={88} fill={palette.ink} />
							))}
						</g>
						<text
							x={mid}
							y={perforationY + 144}
							fontSize={10}
							fill={palette.ink}
							textAnchor="middle"
							letterSpacing={2.4}
							fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
						>
							{ticket.serial}
						</text>
						<text x={mid} y={ticketHeight - 22} fontSize={9} fill={palette.muted} textAnchor="middle" letterSpacing={1.6}>
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
	const posterHeight = svg.viewBox.baseVal.height;
	const markup = new XMLSerializer().serializeToString(svg);
	const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
	try {
		const image = new Image();
		image.decoding = "async";
		image.src = url;
		await image.decode();
		const canvas = document.createElement("canvas");
		canvas.width = POSTER_WIDTH * scale;
		canvas.height = posterHeight * scale;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("canvas unavailable");
		ctx.scale(scale, scale);
		ctx.drawImage(image, 0, 0, POSTER_WIDTH, posterHeight);
		return canvas.toDataURL("image/png");
	} finally {
		URL.revokeObjectURL(url);
	}
}
