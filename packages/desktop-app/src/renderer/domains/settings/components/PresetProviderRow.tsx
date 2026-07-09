import { Button } from "@shared/components/ui/button";
import { ProviderIcon } from "@shared/components/provider-icon";
import { cn } from "@shared/lib/utils";
import { InputField } from "./ModelsSettings";
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
		<div className="border-b border-border last:border-b-0">
			<div className="flex items-center gap-3 px-5 py-3.5">
				<button
					type="button"
					onClick={() => onToggleExpanded(row)}
					className="flex min-w-0 flex-1 items-center gap-3 text-left"
					title={row.isExpanded ? labels.collapseModels : labels.viewModels}
				>
					<span
						className={cn(
							"icon-[mdi--chevron-right] h-4 w-4 shrink-0 text-muted-foreground transition-transform",
							row.isExpanded && "rotate-90",
						)}
					/>
					<ProviderIcon symbol={row.icon} className="h-7 w-7 shrink-0" />
					<div className="min-w-0 flex-1">
						<div className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-foreground">
							<span className="truncate">{row.displayName}</span>
							{row.adopted && (
								<span className="shrink-0 whitespace-nowrap rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
									{labels.enabled}
								</span>
							)}
							{row.offline && (
								<span className="shrink-0 whitespace-nowrap rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">
									{labels.deprecated}
								</span>
							)}
						</div>
						<div className="mt-0.5 truncate text-[11px] text-muted-foreground">
							{labels.modelsCount(row.models.length)}
						</div>
					</div>
				</button>
				<div className="flex shrink-0 items-center gap-1">
					{row.adopted ? (
						<>
							<Button variant="ghost" size="sm" onClick={() => onToggleEditor(row)}>
								{row.isOpen ? labels.collapse : labels.changeKey}
							</Button>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={() => void onRemove(row)}
								title={labels.remove}
								className="text-muted-foreground hover:text-destructive"
							>
								<span className="icon-[mdi--delete-outline] h-3.5 w-3.5" />
							</Button>
						</>
					) : (
						<Button
							variant="primary"
							size="sm"
							onClick={() => onToggleEditor(row)}
							disabled={row.offline}
						>
							{row.isOpen ? labels.collapse : labels.enable}
						</Button>
					)}
				</div>
			</div>

			{row.isOpen && (
				<div className="border-t border-border bg-secondary/40 px-5 py-3">
					<label className="mb-1 block text-[11px] text-muted-foreground">
						{labels.apiKeyDirect(row.displayName)}
					</label>
					<div className="flex items-center gap-2">
						<div className="flex-1">
							<InputField value={draftKey} onChange={onDraftKeyChange} placeholder="sk-..." type="password" />
						</div>
						<Button
							variant="primary"
							size="sm"
							onClick={() => void onAdopt(row)}
							disabled={!draftKey.trim() || saving}
						>
							{row.adopted ? labels.save : labels.enable}
						</Button>
					</div>
				</div>
			)}

			{row.isExpanded && <PresetProviderModelsList row={row} labels={labels} />}
		</div>
	);
}
