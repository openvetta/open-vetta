import { Button } from "@shared/components/ui/button";
import { cn } from "@shared/lib/utils";
import { PresetProvidersSectionView as ThemePresetProvidersSectionView } from "@vetta/theme-ui/settings";
import { SETTINGS_SECTION } from "../registry";
import { PresetProviderRow } from "./PresetProviderRow";
import type { PresetProvidersSectionModel } from "./usePresetProvidersSectionModel";

export function PresetProvidersSectionView({ model }: { model: PresetProvidersSectionModel }): JSX.Element {
	return (
		<ThemePresetProvidersSectionView
			section={SETTINGS_SECTION["models-preset-providers"]}
			labels={model.labels}
			error={model.error}
			hasRows={model.rows.length > 0}
			loading={model.loading}
			refreshControl={
				<Button variant="ghost" size="sm" onClick={() => void model.onReload()} disabled={model.loading}>
					<span className={cn("icon-[mdi--refresh] h-3.5 w-3.5", model.loading && "animate-spin")} />
					{model.loading ? model.labels.refreshing : model.labels.refresh}
				</Button>
			}
			rows={model.rows.map((row) => (
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
		/>
	);
}
