import { Button, Input, cn } from "@vetta-org/ui";
import type { JSX } from "react";

/** 单个模型的连通性测试结果。 */
export interface PresetProviderModelTestView {
	readonly status: "testing" | "ok" | "fail";
	readonly message?: string;
}

export interface PresetProviderModelRowView {
	readonly contextWindow?: number | null;
	readonly hasReasoning?: boolean;
	/** 上游声明的思考档位，跟在「思考」标记后面。 */
	readonly reasoningLevels?: readonly string[];
	readonly hasVision?: boolean;
	readonly id: string;
	readonly name: string;
	readonly price?: string | null;
	readonly test?: PresetProviderModelTestView;
}

export interface PresetProviderModelsListViewLabels {
	readonly clearSearch: string;
	readonly listLabel: string;
	readonly noMatchingModels: string;
	readonly noModels: string;
	readonly perMillionTokens: string;
	readonly searchPlaceholder: string;
	readonly thinking: string;
	readonly testAction: string;
	readonly testing: string;
	readonly testOk: string;
	readonly testFail: string;
}

export interface PresetProviderModelsListViewProps {
	readonly labels: PresetProviderModelsListViewLabels;
	readonly modelRows: readonly PresetProviderModelRowView[];
	readonly onSearchQueryChange: (value: string) => void;
	/** 缺省则不显示测试按钮(服务商还没启用,无从探测)。 */
	readonly onTest?: (modelId: string) => void;
	readonly searchQuery: string;
	readonly totalModelCount: number;
}

export function PresetProviderModelsListView({
	labels,
	modelRows,
	onSearchQueryChange,
	onTest,
	searchQuery,
	totalModelCount,
}: PresetProviderModelsListViewProps): JSX.Element {
	return (
		<div className="border-t border-border bg-secondary/30">
			{totalModelCount > 0 && (
				<div className="px-5 py-2">
					<div className="relative">
						<span
							aria-hidden="true"
							className="icon-[solar--magnifer-linear] pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60"
						/>
						<Input
							type="search"
							value={searchQuery}
							onChange={(event) => onSearchQueryChange(event.target.value)}
							placeholder={labels.searchPlaceholder}
							aria-label={labels.searchPlaceholder}
							className="h-7 bg-background/40 pl-8 pr-8 text-[11px]"
						/>
						{searchQuery && (
							<button
								type="button"
								onClick={() => onSearchQueryChange("")}
								aria-label={labels.clearSearch}
								className="absolute right-1.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							>
								<span aria-hidden="true" className="icon-[solar--close-circle-linear] size-3.5" />
							</button>
						)}
					</div>
				</div>
			)}
			<div
				role="region"
				aria-label={labels.listLabel}
				tabIndex={0}
				className="max-h-[min(24rem,50vh)] overflow-y-auto overscroll-contain outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
			>
				{modelRows.length === 0 && (
					<div aria-live="polite" className="px-5 py-4 text-center text-[12px] text-muted-foreground">
						{totalModelCount > 0 ? labels.noMatchingModels : labels.noModels}
					</div>
				)}
				{modelRows.map((model) => (
					<div
						key={model.id}
						className="flex items-center gap-3 border-b border-border/50 px-5 py-2 last:border-b-0 hover:bg-accent/40"
					>
						<div className="min-w-0 flex-1">
							<div className="truncate text-[12px] text-foreground">{model.name}</div>
							{model.name !== model.id && (
								<div className="truncate text-[10px] text-muted-foreground/70">{model.id}</div>
							)}
							{model.price && (
								<div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground/80">
									<span>{model.price}</span>
									<span className="rounded bg-accent px-1 py-0.5 text-[9px] text-muted-foreground">
										{labels.perMillionTokens}
									</span>
								</div>
							)}
						</div>
						<span className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
							{model.contextWindow != null && <span>{(model.contextWindow / 1024).toFixed(0)}K ctx</span>}
							{model.hasVision && (
								<span className="rounded bg-primary/10 px-1 py-0.5 text-[9px] text-primary">vision</span>
							)}
							{model.hasReasoning && (
								<span className="rounded bg-accent px-1 py-0.5 text-[9px] text-muted-foreground">
									{labels.thinking}
									{model.reasoningLevels?.length ? ` · ${model.reasoningLevels.join("/")}` : ""}
								</span>
							)}
						</span>
						{onTest && <ModelTestControl model={model} labels={labels} onTest={onTest} />}
					</div>
				))}
			</div>
		</div>
	);
}

function ModelTestControl({
	model,
	labels,
	onTest,
}: {
	readonly model: PresetProviderModelRowView;
	readonly labels: PresetProviderModelsListViewLabels;
	readonly onTest: (modelId: string) => void;
}): JSX.Element {
	const test = model.test;
	if (test?.status === "testing") {
		return (
			<Button variant="ghost" size="xs" disabled className="shrink-0">
				<span className="icon-[solar--refresh-linear] h-3 w-3 animate-spin" />
				{labels.testing}
			</Button>
		);
	}
	if (test?.status === "ok" || test?.status === "fail") {
		const ok = test.status === "ok";
		return (
			<Button
				variant="ghost"
				size="xs"
				onClick={() => onTest(model.id)}
				title={test.message}
				className={cn("shrink-0", ok ? "text-emerald-400" : "text-destructive")}
			>
				<span
					className={cn("h-3 w-3", ok ? "icon-[solar--check-circle-linear]" : "icon-[solar--danger-triangle-linear]")}
				/>
				{ok ? labels.testOk : labels.testFail}
			</Button>
		);
	}
	return (
		<Button variant="ghost" size="xs" onClick={() => onTest(model.id)} title={labels.testAction} className="shrink-0">
			<span className="icon-[solar--plug-circle-linear] h-3 w-3" />
			{labels.testAction}
		</Button>
	);
}
