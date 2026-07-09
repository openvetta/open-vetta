import { Button } from "@shared/components/ui/button";
import { cn } from "@shared/lib/utils";
import { SettingSection } from "./shared";
import { SETTINGS_SECTION } from "../registry";
import { PresetProviderRow } from "./PresetProviderRow";
import type { PresetProvidersSectionModel } from "./usePresetProvidersSectionModel";

export function PresetProvidersSectionView({ model }: { model: PresetProvidersSectionModel }): JSX.Element {
	return (
		<div className="mt-6">
			<SettingSection
				section={SETTINGS_SECTION["models-preset-providers"]}
				title={
					<div className="flex items-center justify-between">
						<span>{model.labels.title}</span>
						<Button variant="ghost" size="sm" onClick={() => void model.onReload()} disabled={model.loading}>
							<span className={cn("icon-[mdi--refresh] h-3.5 w-3.5", model.loading && "animate-spin")} />
							{model.loading ? model.labels.refreshing : model.labels.refresh}
						</Button>
					</div>
				}
			>
				{model.error && model.rows.length === 0 && (
					<div className="flex items-center gap-2 px-5 py-3 text-[12px] text-amber-400">
						<span className="icon-[mdi--alert-circle-outline] h-3.5 w-3.5 shrink-0" />
						{model.error}，{model.labels.clickRetry}
					</div>
				)}
				{model.rows.length === 0 && !model.error && (
					<div className="px-5 py-6 text-center text-[12px] text-muted-foreground">
						{model.loading ? model.labels.loading : model.labels.noPresetProviders}
					</div>
				)}

				{model.rows.map((row) => (
					<PresetProviderRow
						key={row.id}
						row={row}
						draftKey={model.draftKey}
						saving={model.saving}
						labels={model.labels}
						onToggleExpanded={model.onToggleExpanded}
						onToggleEditor={model.onToggleEditor}
						onDraftKeyChange={model.onDraftKeyChange}
						onAdopt={model.onAdopt}
						onRemove={model.onRemove}
					/>
				))}
			</SettingSection>
		</div>
	);
}
