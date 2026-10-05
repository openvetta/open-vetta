import { Button } from "@shared/components/ui/button";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ModelUsageOverviewView, ModelUsagePricingView } from "@vetta-org/theme-ui/settings";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
	buildOverviewSlots,
	formatModelUsageTokens,
	lookupModelMeta,
	modelColorOf,
	useModelUsageModel,
} from "./useModelUsageModel";

export function ModelUsageSettings(): JSX.Element {
	const { t } = useTranslation("settings");
	const model = useModelUsageModel();
	const search = useSearch({ strict: false });
	const navigate = useNavigate();
	const view = search.section === "model-usage-pricing" ? "pricing" : "overview";
	const selectView = (next: "overview" | "pricing") => {
		void navigate({
			to: "/settings/$tab",
			params: { tab: "modelUsage" },
			search: { section: next === "pricing" ? "model-usage-pricing" : "model-usage-overview" },
		});
	};
	const { state, actions, config } = model;

	const slots = useMemo(() => buildOverviewSlots(state.summary), [state.summary]);

	const overviewModels = useMemo(() => {
		const summary = state.summary;
		if (!summary) return [];
		const totalCost = Math.max(1e-9, summary.costTotal);
		return summary.models.map((item) => {
			const meta = lookupModelMeta(config, item.provider, item.model);
			const inputPlusCache = item.input + item.cacheRead;
			const cacheHitRate = inputPlusCache > 0 ? item.cacheRead / inputPlusCache : 0;
			const cacheSavings =
				meta.inputPrice !== undefined && meta.cacheReadPrice !== undefined
					? Math.max(0, (item.cacheRead * (meta.inputPrice - meta.cacheReadPrice)) / 1_000_000)
					: 0;
			return {
				provider: item.provider,
				model: item.model,
				name: meta.name,
				api: meta.api ?? item.api,
				isDefault: state.defaultModelKey === `${item.provider}/${item.model}`,
				color: modelColorOf(item.provider, item.model),
				requests: item.requests,
				input: item.input,
				output: item.output,
				cacheRead: item.cacheRead,
				cacheWrite: item.cacheWrite,
				totalTokens: item.totalTokens,
				costTotal: item.costTotal,
				outputSpeed: item.outputSpeed,
				cacheHitRate,
				cacheSavings,
				costShare: item.costTotal / totalCost,
				peakWindow: peakWindowOf(item.buckets),
				buckets: item.buckets,
				inputPrice: meta.inputPrice,
				outputPrice: meta.outputPrice,
				cacheReadPrice: meta.cacheReadPrice,
				cacheWritePrice: meta.cacheWritePrice,
			};
		});
	}, [state.summary, state.defaultModelKey, config]);

	const stats = useMemo(() => {
		const summary = state.summary;
		if (!summary) {
			return {
				periodCost: 0,
				periodCostOriginal: 0,
				cacheSavings: 0,
				totalTokens: 0,
				inputTokens: 0,
				outputTokens: 0,
				cacheReadTokens: 0,
				activeModelCount: 0,
				requests: 0,
				avgTtftMs: undefined,
				peakOutputSpeed: 0,
				cacheHitRate: 0,
				avgCostPer1k: 0,
			};
		}
		const cacheSavings = overviewModels.reduce((sum, item) => sum + item.cacheSavings, 0);
		const inputPlusCache = summary.input + summary.cacheRead;
		const peakOutputSpeed = Math.max(0, ...summary.models.map((item) => item.outputSpeed));
		return {
			periodCost: summary.costTotal,
			periodCostOriginal: summary.costTotal + cacheSavings,
			cacheSavings,
			totalTokens: summary.totalTokens,
			inputTokens: summary.input,
			outputTokens: summary.output,
			cacheReadTokens: summary.cacheRead,
			activeModelCount: summary.models.length,
			requests: summary.requests,
			avgTtftMs: undefined,
			peakOutputSpeed,
			cacheHitRate: inputPlusCache > 0 ? summary.cacheRead / inputPlusCache : 0,
			avgCostPer1k: summary.requests > 0 ? (summary.costTotal / summary.requests) * 1000 : 0,
		};
	}, [state.summary, overviewModels]);

	const pricingModels = useMemo(() => {
		return overviewModels.map((item) => ({
			provider: item.provider,
			model: item.model,
			name: item.name,
			api: item.api,
			color: item.color,
			isDefault: item.isDefault,
			inputPrice: item.inputPrice,
			outputPrice: item.outputPrice,
			cacheReadPrice: item.cacheReadPrice,
			cacheWritePrice: item.cacheWritePrice,
			perRequestCost: item.requests > 0 ? item.costTotal / item.requests : 0,
			totalCost: item.costTotal,
			cacheSavings: item.cacheSavings,
			cacheHitRate: item.cacheHitRate,
			slotCosts: slots.map(
				(slot) => slot.byModel.find((part) => part.key === `${item.provider}/${item.model}`)?.cost ?? 0,
			),
		}));
	}, [overviewModels, slots]);

	const composition = useMemo(() => {
		const summary = state.summary;
		const cacheSavings = overviewModels.reduce((sum, item) => sum + item.cacheSavings, 0);
		const cacheReadCost =
			summary?.models.reduce((sum, item) => {
				const price = lookupModelMeta(config, item.provider, item.model).cacheReadPrice;
				return sum + (price !== undefined ? (item.cacheRead * price) / 1_000_000 : 0);
			}, 0) ?? 0;
		return {
			inputCost:
				summary?.models.reduce((sum, item) => {
					const price = lookupModelMeta(config, item.provider, item.model).inputPrice;
					return sum + (price !== undefined ? (item.input * price) / 1_000_000 : 0);
				}, 0) ?? 0,
			cacheReadCost,
			cacheWriteCost:
				summary?.models.reduce((sum, item) => {
					const price = lookupModelMeta(config, item.provider, item.model).cacheWritePrice;
					return sum + (price !== undefined ? (item.cacheWrite * price) / 1_000_000 : 0);
				}, 0) ?? 0,
			outputCost:
				summary?.models.reduce((sum, item) => {
					const price = lookupModelMeta(config, item.provider, item.model).outputPrice;
					return sum + (price !== undefined ? (item.output * price) / 1_000_000 : 0);
				}, 0) ?? 0,
			cacheSavings,
			cacheSavingsShare:
				summary && summary.costTotal + cacheSavings > 0 ? cacheSavings / (summary.costTotal + cacheSavings) : 0,
			inputTokens: formatModelUsageTokens(summary?.input ?? 0),
			cacheReadTokens: formatModelUsageTokens(summary?.cacheRead ?? 0),
			cacheWriteTokens: formatModelUsageTokens(summary?.cacheWrite ?? 0),
			outputTokens: formatModelUsageTokens(summary?.output ?? 0),
		};
	}, [state.summary, overviewModels, config]);

	const empty = !state.loading && !state.error && (state.summary?.requests ?? 0) === 0;
	const selectedSlotLabel =
		(slots.find((slot) => String(slot.startedAt) === state.selectedSlotKey) ?? slots.at(-1))?.label ?? "";

	return (
		<div className="@container mx-auto w-full max-w-[1240px] px-8 pt-6 pb-8">
			{state.loading && !state.summary && (
				<output className="block mb-4 text-[12px] text-muted-foreground">{t("loading")}</output>
			)}
			{state.error && (
				<div
					role="alert"
					className="mb-4 flex items-center gap-3 rounded-lg border border-destructive/40 p-3 text-[12px] text-foreground"
				>
					<span>{t("modelUsage.loadFailed")}</span>
					<Button type="button" variant="outline" size="sm" onClick={actions.retry}>
						{t("modelUsage.retry")}
					</Button>
				</div>
			)}
			{view === "overview" ? (
				<ModelUsageOverviewView
					range={state.range}
					onRangeChange={actions.setRange}
					metric={state.metric}
					onMetricChange={actions.setMetric}
					stats={stats}
					slots={slots}
					models={overviewModels}
					selectedSlotKey={state.selectedSlotKey}
					onSelectSlot={(startedAt) => actions.setSelectedSlotKey(String(startedAt))}
					onOpenPricing={() => selectView("pricing")}
					loading={state.loading}
					empty={empty}
					footer={{
						totalCalls: state.summary?.requests ?? 0,
						totalTokens: formatModelUsageTokens(state.summary?.totalTokens ?? 0),
						periodNet: `$${(state.summary?.costTotal ?? 0).toFixed(2)}`,
					}}
					labels={{
						title: t("modelUsage.title"),
						description: t("modelUsage.description"),
						realtime: t("modelUsage.realtime"),
						utc8: t("modelUsage.utc8"),
						range: (range) => t(`modelUsage.range.${range}`),
						pricingLink: t("modelUsage.pricingLink"),
						stats: {
							periodCost: t("modelUsage.stats.periodCost"),
							vsLastPeriod: (value) => `${t("modelUsage.stats.vsLastPeriod")} ${value}`,
							totalTokens: t("modelUsage.stats.totalTokens"),
							activeModels: (count) => t("modelUsage.stats.activeModels", { count }),
							requests: t("modelUsage.stats.requests"),
							calls: t("modelUsage.stats.calls"),
							cacheHitRate: t("modelUsage.stats.cacheHitRate"),
							avgCostPerRequest: t("modelUsage.stats.avgCostPerRequest"),
							perRequest: t("modelUsage.stats.perRequest"),
							originalPrice: t("modelUsage.stats.originalPrice"),
							cacheSavings: t("modelUsage.stats.cacheSavings"),
							inputLabel: t("modelUsage.stats.inputLabel"),
							outputLabel: t("modelUsage.stats.outputLabel"),
							cacheReadLabel: t("modelUsage.stats.cacheReadLabel"),
							avgTtft: t("modelUsage.stats.avgTtft"),
							peakTps: t("modelUsage.stats.peakTps"),
						},
						peak: {
							title: (share, models) => t("modelUsage.peak.title", { range: selectedSlotLabel, share, models }),
							tokenMetric: t("modelUsage.peak.tokenMetric"),
							costMetric: t("modelUsage.peak.costMetric"),
							requestsMetric: t("modelUsage.peak.requestsMetric"),
							slotDetail: t("modelUsage.peak.slotDetail", { range: selectedSlotLabel }),
							allDayPeak: t("modelUsage.peak.allDayPeak"),
							slotTotal: t("modelUsage.peak.slotTotal"),
							slotBill: t("modelUsage.peak.slotBill"),
							slotCacheHit: t("modelUsage.peak.slotCacheHit"),
							hit: t("modelUsage.peak.hit"),
						},
						models: {
							title: t("modelUsage.models.title"),
							description: t("modelUsage.models.description"),
							defaultBadge: t("modelUsage.models.defaultBadge"),
							highFreqWindow: t("modelUsage.models.highFreqWindow"),
							requests: t("modelUsage.models.requests"),
							hit: t("modelUsage.models.hit"),
							cacheReadPrice: t("modelUsage.models.cacheReadPrice"),
							readDiscount: t("modelUsage.models.readDiscount"),
							share: t("modelUsage.models.share"),
							saved: t("modelUsage.models.saved"),
							footer: t("modelUsage.models.footer"),
							totalCalls: t("modelUsage.models.totalCalls"),
							totalTokensLabel: t("modelUsage.models.totalTokensLabel"),
							periodNet: t("modelUsage.models.periodNet"),
						},
						legend: {
							input: t("modelUsage.legend.input"),
							cacheRead: t("modelUsage.legend.cacheRead"),
							output: t("modelUsage.legend.output"),
						},
						empty: t("modelUsage.empty"),
					}}
				/>
			) : (
				<ModelUsagePricingView
					models={pricingModels}
					slots={slots.map((slot) => ({
						startedAt: slot.startedAt,
						label: slot.label,
						totalCost: slot.totalCost,
					}))}
					composition={composition}
					configuredCount={overviewModels.filter((item) => item.inputPrice !== undefined).length}
					totalCount={overviewModels.length}
					avgCacheDiscount={avgCacheDiscountOf(overviewModels)}
					exporting={state.exporting}
					onExportCsv={() => void actions.exportCsv()}
					onSyncOfficial={() => void actions.syncOfficialPrices()}
					onBack={() => selectView("overview")}
					labels={{
						title: t("modelUsage.pricing.title"),
						description: t("modelUsage.pricing.description"),
						scrollHint: t("modelUsage.pricing.scrollHint"),
						back: t("modelUsage.childOverview"),
						syncOfficial: t("modelUsage.pricing.syncOfficial"),
						exportCsv: t("modelUsage.pricing.exportCsv"),
						exporting: t("modelUsage.pricing.exporting"),
						heatmapTitle: t("modelUsage.pricing.heatmapTitle"),
						heatmapHint: t("modelUsage.pricing.heatmapHint"),
						heatmapHintPeak: t("modelUsage.pricing.heatmapHintPeak"),
						slotTotal: t("modelUsage.pricing.slotTotal"),
						compositionTitle: t("modelUsage.pricing.compositionTitle"),
						savedBadge: (share) => t("modelUsage.pricing.savedBadge", { share }),
						regularInput: (tokens) => t("modelUsage.pricing.regularInput", { tokens }),
						cacheReadLine: (tokens) => t("modelUsage.pricing.cacheReadLine", { tokens }),
						cacheWriteLine: (tokens) => t("modelUsage.pricing.cacheWriteLine", { tokens }),
						outputLine: (tokens) => t("modelUsage.pricing.outputLine", { tokens }),
						budgetTitle: t("modelUsage.pricing.budgetTitle"),
						budgetUnconfigured: t("modelUsage.pricing.budgetUnconfigured"),
						budgetSafe: t("modelUsage.pricing.budgetSafe"),
						budgetHint: (cost) => t("modelUsage.pricing.budgetHint", { cost }),
						catalogTitle: t("modelUsage.pricing.catalogTitle"),
						catalogHint: t("modelUsage.pricing.catalogHint"),
						catalogNote: t("modelUsage.pricing.catalogNote"),
						configuredCount: t("modelUsage.pricing.configuredCount"),
						avgCacheDiscount: t("modelUsage.pricing.avgCacheDiscount"),
						standardInput: t("modelUsage.pricing.standardInput"),
						columns: {
							model: t("modelUsage.pricing.columns.model"),
							api: t("modelUsage.pricing.columns.api"),
							input: t("modelUsage.pricing.columns.input"),
							cacheRead: t("modelUsage.pricing.columns.cacheRead"),
							cacheWrite: t("modelUsage.pricing.columns.cacheWrite"),
							output: t("modelUsage.pricing.columns.output"),
							perRequest: t("modelUsage.pricing.columns.perRequest"),
							status: t("modelUsage.pricing.columns.status"),
						},
						statusSynced: t("modelUsage.pricing.statusSynced"),
						perMillion: t("modelUsage.pricing.perMillion"),
						perRequestSuffix: t("modelUsage.pricing.perRequestSuffix"),
						readDiscountBadge: t("modelUsage.pricing.readDiscountBadge"),
					}}
				/>
			)}
		</div>
	);
}

function peakWindowOf(buckets: readonly { startedAt: number; costTotal: number }[]): string {
	if (buckets.length === 0) return "—";
	const peak = [...buckets].sort((left, right) => right.costTotal - left.costTotal)[0];
	const date = new Date(peak.startedAt);
	const startHour = date.getHours();
	const endHour = (startHour + 2) % 24;
	return `${String(startHour).padStart(2, "0")}:00-${String(endHour).padStart(2, "0")}:00`;
}

function avgCacheDiscountOf(models: readonly { inputPrice?: number; cacheReadPrice?: number }[]): number {
	const ratios = models
		.filter((item) => item.inputPrice !== undefined && item.inputPrice > 0 && item.cacheReadPrice !== undefined)
		.map((item) => (item.cacheReadPrice as number) / (item.inputPrice as number));
	if (ratios.length === 0) return 0;
	return ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
}
