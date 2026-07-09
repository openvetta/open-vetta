import type {
	PresetProviderRow,
	PresetProvidersSectionLabels,
} from "./usePresetProvidersSectionModel";

export function PresetProviderModelsList({
	row,
	labels,
}: {
	row: PresetProviderRow;
	labels: PresetProvidersSectionLabels;
}): JSX.Element {
	return (
		<div className="border-t border-border bg-secondary/30">
			{row.modelRows.length === 0 && (
				<div className="px-5 py-4 text-center text-[12px] text-muted-foreground">{labels.noModels}</div>
			)}
			{row.modelRows.map((model) => (
				<div key={model.id} className="border-b border-border/50 px-5 py-2 pl-12 last:border-b-0">
					<div className="truncate text-[12px] text-foreground">{model.name}</div>
					<div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
						{model.contextWindow != null && <span>{(model.contextWindow / 1024).toFixed(0)}K ctx</span>}
						{model.hasVision && (
							<span className="rounded bg-primary/10 px-1 py-0.5 text-[9px] text-primary">vision</span>
						)}
						{model.hasReasoning && (
							<span className="rounded bg-accent px-1 py-0.5 text-[9px] text-muted-foreground">
								{labels.thinking}
							</span>
						)}
					</div>
					{model.price && (
						<div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground/80">
							<span>{model.price}</span>
							<span className="rounded bg-accent px-1 py-0.5 text-[9px] text-muted-foreground">
								{labels.perMillionTokens}
							</span>
						</div>
					)}
				</div>
			))}
		</div>
	);
}
