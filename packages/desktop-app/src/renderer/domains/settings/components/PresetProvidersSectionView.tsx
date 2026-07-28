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
			showAllModels={model.showAllModels}
			togglingShowAll={model.togglingShowAll}
			onToggleShowAllModels={(showAll) => void model.onToggleShowAllModels(showAll)}
			rows={model.rows.map((row) => (
				<PresetProviderRow
					key={row.id}
					row={row}
					draftKey={model.draftKeys[row.id] ?? ""}
					saving={model.saving}
					labels={model.labels}
					onToggleExpanded={model.onToggleExpanded}
					onToggleEditor={model.onToggleEditor}
					onDraftKeyChange={model.onDraftKeyChange}
					onAdopt={model.onAdopt}
					onRemove={model.onRemove}
					onRefreshModels={model.onRefreshModels}
				/>
			))}
		/>
	);
}
