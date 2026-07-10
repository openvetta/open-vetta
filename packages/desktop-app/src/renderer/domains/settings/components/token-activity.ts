export type TokenActivityMode = "daily" | "weekly" | "cumulative";

export interface UsageSeriesPointLike {
	date: string;
	tokens: number;
}

export interface ActivityColumn {
	key: string;
	date: string;
	endDate: string;
	tokens: number;
	/** Month axis label for first column of each month; null otherwise */
	monthKey: string | null;
}

export const TOKEN_ACTIVITY_MAX_ROWS = 10;

function parseLocalDate(iso: string): Date {
	const [y, m, d] = iso.split("-").map(Number);
	return new Date(y!, m! - 1, d!);
}

function formatYmd(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

/** Monday-start week key (YYYY-MM-DD of week start) */
function weekStartKey(iso: string): string {
	const d = parseLocalDate(iso);
	const day = d.getDay();
	const diff = day === 0 ? -6 : 1 - day;
	d.setDate(d.getDate() + diff);
	return formatYmd(d);
}

export function buildActivityColumns(points: UsageSeriesPointLike[], mode: TokenActivityMode): ActivityColumn[] {
	if (points.length === 0) return [];

	let base: { date: string; endDate: string; tokens: number }[];

	if (mode === "weekly") {
		const map = new Map<string, { date: string; endDate: string; tokens: number }>();
		for (const p of points) {
			const start = weekStartKey(p.date);
			const existing = map.get(start);
			if (existing) {
				existing.tokens += p.tokens;
				if (p.date > existing.endDate) existing.endDate = p.date;
			} else {
				map.set(start, { date: start, endDate: p.date, tokens: p.tokens });
			}
		}
		base = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
	} else {
		base = points.map((p) => ({ date: p.date, endDate: p.date, tokens: p.tokens }));
		if (mode === "cumulative") {
			let sum = 0;
			base = base.map((p) => {
				sum += p.tokens;
				return { ...p, tokens: sum };
			});
		}
	}

	let lastMonth = "";
	return base.map((p) => {
		const m = p.date.slice(0, 7);
		const monthKey = m !== lastMonth ? m : null;
		lastMonth = m;
		return {
			key: p.date,
			date: p.date,
			endDate: p.endDate,
			tokens: p.tokens,
			monthKey,
		};
	});
}

export function activityBlockCount(tokens: number, maxTokens: number, maxRows = TOKEN_ACTIVITY_MAX_ROWS): number {
	if (tokens <= 0 || maxTokens <= 0) return 0;
	return Math.max(1, Math.round((tokens / maxTokens) * maxRows));
}

export function formatTokenCount(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return n.toLocaleString();
}
