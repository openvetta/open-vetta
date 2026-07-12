import { ProviderIcon } from "@shared/components/provider-icon";
import { PresetProviderRowView } from "@vetta/theme-ui/settings";
import { PresetProviderModelsList } from "./PresetProviderModelsList";
import type {
	PresetProviderRow as PresetProviderRowModel,
	PresetProvidersSectionLabels,
} from "./usePresetProvidersSectionModel";

export function PresetProviderRow({
	row,
	draftKey,
	saving,
	labels,
	onToggleExpanded,
	onToggleEditor,
	onDraftKeyChange,
	onAdopt,
	onRemove,
}: {
	row: PresetProviderRowModel;
	draftKey: string;
	saving: boolean;
	labels: PresetProvidersSectionLabels;
	onToggleExpanded: (row: PresetProviderRowModel) => void;
	onToggleEditor: (row: PresetProviderRowModel) => void;
	onDraftKeyChange: (key: string) => void;
	onAdopt: (row: PresetProviderRowModel) => Promise<void>;
	onRemove: (row: PresetProviderRowModel) => Promise<void>;
}): JSX.Element {
	return (
		<PresetProviderRowView
			row={row}
			draftKey={draftKey}
			saving={saving}
			labels={labels}
			onToggleExpanded={() => onToggleExpanded(row)}
			onToggleEditor={() => onToggleEditor(row)}
			onDraftKeyChange={onDraftKeyChange}
			onAdopt={() => void onAdopt(row)}
			onRemove={() => void onRemove(row)}
			icon={<ProviderIcon symbol={row.icon} className="h-7 w-7 shrink-0" />}
			modelsList={<PresetProviderModelsList row={row} labels={labels} />}
		/>
	);
}
