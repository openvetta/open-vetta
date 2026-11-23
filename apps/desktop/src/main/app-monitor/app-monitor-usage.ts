/**
 * Token usage aggregates kept by the app monitor.
 *
 * Only per-model and per-hour sums are stored; no prompt, session or request detail.
 */

export const HOURS_PER_DAY = 24;
/** Bounds the per-bucket model map so a misbehaving provider cannot grow monitor files without limit. */
export const MAX_TRACKED_MODELS = 256;
const MODEL_FIELD_MAX_LENGTH = 160;
export const UNKNOWN_MODEL_KEY = "unknown";

export interface AppMonitorModelUsageStats {
	provider: string;
	model: string;
	requests: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	costTotal: number;
}

export interface AppMonitorUsageAggregate {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	costTotal: number;
	/** Completed model calls; files written before per-model tracking only have the token sums above. */
	requests: number;
	byModel: Record<string, AppMonitorModelUsageStats>;
	/** Tokens per local hour (0–23) in the reporting time zone. */
	hourlyTokens: number[];
}

export interface AppMonitorUsageSample {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	costTotal: number;
	model?: { provider: string; id: string };
}

function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function normalizeCount(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function normalizeAmount(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizeModelField(value: unknown): string {
	if (typeof value !== "string") return "";
	return value.trim().slice(0, MODEL_FIELD_MAX_LENGTH);
}

function isSafeKey(key: string): boolean {
	return key !== "" && key !== "__proto__" && key !== "prototype" && key !== "constructor";
}

export function modelUsageKey(provider: string, model: string): string {
	if (provider === "" && model === "") return UNKNOWN_MODEL_KEY;
	return `${provider}/${model}`;
}

export function createModelUsageStats(provider: string, model: string): AppMonitorModelUsageStats {
	return {
		provider,
		model,
		requests: 0,
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		costTotal: 0,
	};
}

export function normalizeModelUsageRecord(value: unknown): Record<string, AppMonitorModelUsageStats> {
	const statsByModel: Record<string, AppMonitorModelUsageStats> = {};
	let count = 0;
	for (const [key, rawStats] of Object.entries(asRecord(value))) {
		if (!isSafeKey(key) || count >= MAX_TRACKED_MODELS) continue;
		const stats = asRecord(rawStats);
		const provider = normalizeModelField(stats.provider);
		const model = normalizeModelField(stats.model);
		statsByModel[key] = {
			provider,
			model,
			requests: normalizeCount(stats.requests),
			inputTokens: normalizeCount(stats.inputTokens),
			outputTokens: normalizeCount(stats.outputTokens),
			cacheReadTokens: normalizeCount(stats.cacheReadTokens),
			cacheWriteTokens: normalizeCount(stats.cacheWriteTokens),
			costTotal: normalizeAmount(stats.costTotal),
		};
		count += 1;
	}
	return statsByModel;
}

export function createEmptyHourlyTokens(): number[] {
	return new Array<number>(HOURS_PER_DAY).fill(0);
}

export function normalizeHourlyTokens(value: unknown): number[] {
	const hourly = createEmptyHourlyTokens();
	if (!Array.isArray(value)) return hourly;
	for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) hourly[hour] = normalizeCount(value[hour]);
	return hourly;
}

export function usageSampleTokens(sample: AppMonitorUsageSample): number {
	return (
		Math.max(0, sample.input) +
		Math.max(0, sample.output) +
		Math.max(0, sample.cacheRead) +
		Math.max(0, sample.cacheWrite)
	);
}

/** Adds one completed model call to a per-model map; returns false when the map is full and the model is new. */
export function addModelUsage(
	statsByModel: Record<string, AppMonitorModelUsageStats>,
	sample: AppMonitorUsageSample,
): boolean {
	const provider = normalizeModelField(sample.model?.provider);
	const model = normalizeModelField(sample.model?.id);
	const key = modelUsageKey(provider, model);
	if (!isSafeKey(key)) return false;
	let stats = statsByModel[key];
	if (!stats) {
		if (Object.keys(statsByModel).length >= MAX_TRACKED_MODELS) return false;
		stats = createModelUsageStats(provider, model);
		statsByModel[key] = stats;
	}
	stats.requests += 1;
	stats.inputTokens += Math.max(0, sample.input);
	stats.outputTokens += Math.max(0, sample.output);
	stats.cacheReadTokens += Math.max(0, sample.cacheRead);
	stats.cacheWriteTokens += Math.max(0, sample.cacheWrite);
	stats.costTotal += Math.max(0, sample.costTotal);
	return true;
}

/** Records one completed model call into the totals, per-model map and hour histogram. */
export function recordUsageSample(usage: AppMonitorUsageAggregate, sample: AppMonitorUsageSample, hour: number): void {
	usage.inputTokens += Math.max(0, sample.input);
	usage.outputTokens += Math.max(0, sample.output);
	usage.cacheReadTokens += Math.max(0, sample.cacheRead);
	usage.cacheWriteTokens += Math.max(0, sample.cacheWrite);
	usage.costTotal += Math.max(0, sample.costTotal);
	usage.requests += 1;
	addModelUsage(usage.byModel, sample);
	if (hour >= 0 && hour < HOURS_PER_DAY)
		usage.hourlyTokens[hour] = (usage.hourlyTokens[hour] ?? 0) + usageSampleTokens(sample);
}
