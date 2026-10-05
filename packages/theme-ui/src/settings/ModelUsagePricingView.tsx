import type { JSX } from "react";

function cn(...parts: Array<string | false | null | undefined>): string {
	return parts.filter(Boolean).join(" ");
}

export interface ModelUsagePricingSlot {
	readonly startedAt: number;
	readonly label: string;
	readonly totalCost: number;
}

export interface ModelUsagePricingModel {
	readonly provider: string;
	readonly model: string;
	readonly name: string;
	readonly api: string;
	readonly color: string;
	readonly isDefault: boolean;
	readonly inputPrice?: number;
	readonly outputPrice?: number;
	readonly cacheReadPrice?: number;
	readonly cacheWritePrice?: number;
	readonly perRequestCost: number;
	readonly totalCost: number;
	readonly cacheSavings: number;
	readonly cacheHitRate: number;
	readonly slotCosts: readonly number[];
}

export interface ModelUsagePricingComposition {
	readonly inputCost: number;
	readonly cacheReadCost: number;
	readonly cacheWriteCost: number;
	readonly outputCost: number;
	readonly cacheSavings: number;
	readonly cacheSavingsShare: number;
	readonly inputTokens: string;
	readonly cacheReadTokens: string;
	readonly cacheWriteTokens: string;
	readonly outputTokens: string;
}

export interface ModelUsagePricingBudget {
	readonly used: number;
	readonly total: number;
	readonly projected: number;
}

export interface ModelUsagePricingViewProps {
	readonly models: readonly ModelUsagePricingModel[];
	readonly slots: readonly ModelUsagePricingSlot[];
	readonly composition: ModelUsagePricingComposition;
	readonly budget?: ModelUsagePricingBudget | null;
	readonly configuredCount: number;
	readonly totalCount: number;
	readonly avgCacheDiscount: number;
	readonly exporting: boolean;
	readonly onExportCsv: () => void;
	readonly onSyncOfficial: () => void;
	readonly onBack: () => void;
	readonly labels: {
		readonly title: string;
		readonly description: string;
		readonly scrollHint: string;
		readonly back: string;
		readonly syncOfficial: string;
		readonly exportCsv: string;
		readonly exporting: string;
		readonly heatmapTitle: string;
		readonly heatmapHint: string;
		readonly heatmapHintPeak: string;
		readonly slotTotal: string;
		readonly compositionTitle: string;
		readonly savedBadge: (share: string) => string;
		readonly regularInput: (tokens: string) => string;
		readonly cacheReadLine: (tokens: string) => string;
		readonly cacheWriteLine: (tokens: string) => string;
		readonly outputLine: (tokens: string) => string;
		readonly budgetTitle: string;
		readonly budgetUnconfigured: string;
		readonly budgetSafe: string;
		readonly budgetHint: (cost: string) => string;
		readonly catalogTitle: string;
		readonly catalogHint: string;
		readonly catalogNote: string;
		readonly configuredCount: string;
		readonly avgCacheDiscount: string;
		readonly standardInput: string;
		readonly columns: {
			readonly model: string;
			readonly api: string;
			readonly input: string;
			readonly cacheRead: string;
			readonly cacheWrite: string;
			readonly output: string;
			readonly perRequest: string;
			readonly status: string;
		};
		readonly statusSynced: string;
		readonly perMillion: string;
		readonly perRequestSuffix: string;
		readonly readDiscountBadge: string;
	};
}

function formatCost(n: number): string {
	return `$${n.toFixed(2)}`;
}

const MODEL_DOT_CLASS: Record<string, string> = {
	indigo: "bg-indigo-400",
	cyan: "bg-cyan-400",
	emerald: "bg-emerald-400",
	amber: "bg-amber-400",
	pink: "bg-pink-400",
	violet: "bg-violet-400",
	slate: "bg-slate-400",
};

function modelDotClass(color: string): string {
	return MODEL_DOT_CLASS[color] ?? "bg-primary";
}

/** 费用热力格：按该模型最大格分 5 档。 */
function heatClass(value: number, max: number): string {
	if (value <= 0 || max <= 0) return "bg-muted/30 text-muted-foreground/50";
	const ratio = value / max;
	if (ratio >= 0.8) return "bg-primary/80 text-primary-foreground";
	if (ratio >= 0.5) return "bg-primary/60 text-primary-foreground";
	if (ratio >= 0.25) return "bg-primary/40 text-foreground";
	return "bg-primary/20 text-foreground";
}

export function ModelUsagePricingView({
	models,
	slots,
	composition,
	budget,
	configuredCount,
	totalCount,
	avgCacheDiscount,
	exporting,
	onExportCsv,
	onSyncOfficial,
	onBack,
	labels,
}: ModelUsagePricingViewProps): JSX.Element {
	const slotTotals = slots.map((slot) => slot.totalCost);
	const configuredBudget =
		budget &&
		budget.total > 0 &&
		budget.used >= 0 &&
		budget.projected >= 0 &&
		[budget.total, budget.used, budget.projected].every(Number.isFinite)
			? budget
			: null;
	return (
		<div className="flex flex-col gap-6">
			{/* 页头 */}
			<div className="flex flex-wrap items-start justify-between gap-4 pb-1">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-3">
						<button
							type="button"
							onClick={onBack}
							className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
						>
							<span className="icon-[solar--alt-arrow-left-linear] h-3.5 w-3.5" />
							{labels.back}
						</button>
						<h1 className="text-[20px] font-bold text-foreground">{labels.title}</h1>
					</div>
					<p className="mt-1.5 text-[12px] text-muted-foreground">{labels.description}</p>
					<p className="mt-2 text-[11px] text-muted-foreground @min-[60rem]:hidden">{labels.scrollHint}</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={onSyncOfficial}
						className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/40 px-3 py-1.5 text-[11px] text-foreground transition-colors hover:bg-accent/60"
					>
						<span className="icon-[solar--refresh-linear] h-3.5 w-3.5" />
						{labels.syncOfficial}
					</button>
					<button
						type="button"
						onClick={onExportCsv}
						disabled={exporting}
						className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
					>
						<span className="icon-[solar--download-linear] h-3.5 w-3.5" />
						{exporting ? labels.exporting : labels.exportCsv}
					</button>
				</div>
			</div>

			<div className="flex flex-col gap-5">
				{/* 热力矩阵 */}
				<div className="min-w-0 rounded-xl border border-border/50 bg-card/40 p-4">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="text-[13px] font-medium text-foreground">{labels.heatmapTitle}</div>
						<div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
							{labels.heatmapHint}
							<span className="h-2.5 w-2.5 rounded-sm bg-primary/20" />
							<span className="h-2.5 w-2.5 rounded-sm bg-primary/40" />
							<span className="h-2.5 w-2.5 rounded-sm bg-primary/60" />
							<span className="h-2.5 w-2.5 rounded-sm bg-primary/80" />
							{labels.heatmapHintPeak}
						</div>
					</div>
					<section
						aria-label={labels.heatmapTitle}
						// biome-ignore lint/a11y/noNoninteractiveTabindex: Named horizontal scroll region must remain keyboard-focusable.
						tabIndex={0}
						className="mt-4 overflow-x-auto focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
					>
						<table className="w-full min-w-[940px] border-separate" style={{ borderSpacing: "3px" }}>
							<thead>
								<tr>
									<th className="min-w-40 text-left text-[11px] font-normal text-muted-foreground" />
									{slots.map((slot) => (
										<th
											key={slot.startedAt}
											className="min-w-12 text-center text-[10px] font-normal tabular-nums text-muted-foreground/70"
										>
											{slot.label}
										</th>
									))}
									<th className="text-right text-[10px] font-normal text-muted-foreground" />
								</tr>
							</thead>
							<tbody>
								{models.map((model) => {
									const max = Math.max(1e-9, ...model.slotCosts);
									return (
										<tr key={`${model.provider}/${model.model}`}>
											<td className="pr-2 text-[11px] text-foreground">
												<span className="flex items-center gap-1.5">
													<span className={cn("h-1.5 w-1.5 rounded-full", modelDotClass(model.color))} />
													{model.name}
												</span>
											</td>
											{model.slotCosts.map((value, index) => (
												<td key={slots[index]?.startedAt ?? index} className="text-center">
													<div
														className={cn(
															"rounded px-1.5 py-1 text-[10px] tabular-nums",
															heatClass(value, max),
														)}
													>
														${value.toFixed(2)}
													</div>
												</td>
											))}
											<td className="pl-2 text-right text-[11px] font-medium tabular-nums text-foreground">
												{formatCost(model.totalCost)}
											</td>
										</tr>
									);
								})}
								<tr>
									<td className="pr-2 pt-1 text-[10px] text-muted-foreground">{labels.slotTotal}</td>
									{slotTotals.map((value, index) => (
										<td
											key={slots[index]?.startedAt ?? index}
											className="pt-1 text-center text-[10px] font-medium tabular-nums text-foreground"
										>
											${value.toFixed(1)}
										</td>
									))}
									<td className="pl-2 pt-1 text-right text-[11px] font-semibold tabular-nums text-primary">
										{formatCost(slotTotals.reduce((sum, value) => sum + value, 0))}
									</td>
								</tr>
							</tbody>
						</table>
					</section>
				</div>

				{/* 四维计费构成 + 预算 */}
				<div className="flex flex-col">
					<div className="@container grid gap-5 rounded-xl border border-border/50 bg-card/40 p-4 @min-[60rem]:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)]">
						<div className="flex items-center justify-between @min-[60rem]:col-span-2">
							<div className="text-[13px] font-medium text-foreground">{labels.compositionTitle}</div>
							<span className="rounded-full bg-emerald-500/15 px-2 py-px text-[10px] font-medium text-emerald-400">
								{labels.savedBadge(`${(composition.cacheSavingsShare * 100).toFixed(1)}%`)}
							</span>
						</div>
						<div className="flex flex-col gap-3 text-[12px]">
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">{labels.regularInput(composition.inputTokens)}</span>
								<span className="tabular-nums text-foreground">{formatCost(composition.inputCost)}</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-cyan-400">{labels.cacheReadLine(composition.cacheReadTokens)}</span>
								<span className="tabular-nums text-foreground">
									{formatCost(composition.cacheReadCost)}
									<span className="ml-1.5 text-[10px] text-muted-foreground/60 line-through">
										{formatCost(composition.cacheSavings + composition.cacheReadCost)}
									</span>
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-amber-400/90">{labels.cacheWriteLine(composition.cacheWriteTokens)}</span>
								<span className="tabular-nums text-foreground">{formatCost(composition.cacheWriteCost)}</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">{labels.outputLine(composition.outputTokens)}</span>
								<span className="tabular-nums text-foreground">{formatCost(composition.outputCost)}</span>
							</div>
						</div>
						<div className="border-t border-border/40 pt-4 @min-[60rem]:border-l @min-[60rem]:border-t-0 @min-[60rem]:pl-6 @min-[60rem]:pt-0">
							{configuredBudget ? (
								<>
									<div className="flex items-center justify-between text-[11px]">
										<span className="text-muted-foreground">{labels.budgetTitle}</span>
										<span className="tabular-nums text-muted-foreground">
											{formatCost(configuredBudget.used)} / {formatCost(configuredBudget.total)}（
											{((configuredBudget.used / Math.max(1e-9, configuredBudget.total)) * 100).toFixed(1)}
											%）
										</span>
									</div>
									<div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
										<div
											className="h-full rounded-full bg-primary"
											style={{
												width: `${Math.min(100, (configuredBudget.used / Math.max(1e-9, configuredBudget.total)) * 100)}%`,
											}}
										/>
									</div>
									<div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground/70">
										<span>{labels.budgetHint(formatCost(configuredBudget.projected))}</span>
										{configuredBudget.used <= configuredBudget.total &&
											configuredBudget.projected <= configuredBudget.total && (
												<span className="text-emerald-400">{labels.budgetSafe}</span>
											)}
									</div>
								</>
							) : (
								<p className="text-[12px] leading-relaxed text-muted-foreground">{labels.budgetUnconfigured}</p>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* 单价目录 */}
			<div className="rounded-xl border border-border/50 bg-card/40 p-4">
				<div className="flex flex-wrap items-baseline justify-between gap-2">
					<div>
						<div className="text-[13px] font-medium text-foreground">{labels.catalogTitle}</div>
						<div className="mt-0.5 text-[10px] text-muted-foreground/70">{labels.catalogHint}</div>
					</div>
				</div>
				<section
					aria-label={labels.catalogTitle}
					// biome-ignore lint/a11y/noNoninteractiveTabindex: Named horizontal scroll region must remain keyboard-focusable.
					tabIndex={0}
					className="mt-3 overflow-x-auto focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
				>
					<table className="w-full min-w-[1040px]">
						<thead>
							<tr className="border-b border-border/40 text-left text-[10px] text-muted-foreground">
								<th className="pb-2 pr-3 font-normal">{labels.columns.model}</th>
								<th className="pb-2 pr-3 font-normal">{labels.columns.api}</th>
								<th className="pb-2 pr-3 font-normal">{labels.columns.input}</th>
								<th className="pb-2 pr-3 font-normal">{labels.columns.cacheRead}</th>
								<th className="pb-2 pr-3 font-normal">{labels.columns.cacheWrite}</th>
								<th className="pb-2 pr-3 font-normal">{labels.columns.output}</th>
								<th className="pb-2 pr-3 font-normal">{labels.columns.perRequest}</th>
								<th className="pb-2 font-normal">{labels.columns.status}</th>
							</tr>
						</thead>
						<tbody>
							{models.map((model) => (
								<tr
									key={`${model.provider}/${model.model}`}
									className="border-b border-border/30 last:border-0"
								>
									<td className="py-2.5 pr-3">
										<div className="flex items-center gap-1.5">
											<span
												className={cn("h-1.5 w-1.5 shrink-0 rounded-full", modelDotClass(model.color))}
											/>
											<div className="min-w-0">
												<div className="truncate text-[12px] font-medium text-foreground">{model.name}</div>
												<div className="truncate text-[10px] text-muted-foreground/70">
													{model.provider}/{model.model}
												</div>
											</div>
										</div>
									</td>
									<td className="py-2.5 pr-3">
										<span className="rounded-md bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
											{model.api || "—"}
										</span>
									</td>
									<td className="py-2.5 pr-3 text-[11px] tabular-nums text-foreground">
										{model.inputPrice !== undefined ? `$${model.inputPrice.toFixed(2)}` : "—"}
										<span className="ml-1 text-[10px] text-muted-foreground/60">{labels.perMillion}</span>
									</td>
									<td className="py-2.5 pr-3 text-[11px] tabular-nums">
										{model.cacheReadPrice !== undefined ? (
											<>
												<span className="text-emerald-400">${model.cacheReadPrice.toFixed(2)}</span>
												<span className="ml-1 rounded bg-emerald-500/15 px-1 py-px text-[9px] text-emerald-400">
													{labels.readDiscountBadge}
												</span>
											</>
										) : (
											"—"
										)}
									</td>
									<td className="py-2.5 pr-3 text-[11px] tabular-nums text-foreground">
										{model.cacheWritePrice !== undefined ? `$${model.cacheWritePrice.toFixed(2)}` : "—"}
										<span className="ml-1 text-[10px] text-muted-foreground/60">{labels.perMillion}</span>
									</td>
									<td className="py-2.5 pr-3 text-[11px] tabular-nums text-amber-400/90">
										{model.outputPrice !== undefined ? `$${model.outputPrice.toFixed(2)}` : "—"}
										<span className="ml-1 text-[10px] text-muted-foreground/60">{labels.perMillion}</span>
									</td>
									<td className="py-2.5 pr-3 text-[11px] tabular-nums text-foreground">
										${model.perRequestCost.toFixed(4)}
										<span className="ml-1 text-[10px] text-muted-foreground/60">
											{labels.perRequestSuffix}
										</span>
									</td>
									<td className="py-2.5">
										<span className="flex items-center gap-1 text-[10px] text-muted-foreground">
											<span className="icon-[solar--check-circle-linear] h-3 w-3 text-emerald-400" />
											{labels.statusSynced}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
				<div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2.5 text-[10px] text-muted-foreground/70">
					<span>{labels.catalogNote}</span>
					<span className="tabular-nums">
						{labels.configuredCount}：{configuredCount} / {totalCount} · {labels.avgCacheDiscount}：
						{avgCacheDiscount.toFixed(2)}× · {labels.standardInput}
					</span>
				</div>
			</div>
		</div>
	);
}
