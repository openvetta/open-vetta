import type { JSX, ReactNode } from "react";
import { Button, cn } from "@vetta/ui";
import { InputField } from "./SettingsFormFields";

export interface PresetProviderRowModelView {
	readonly displayName: string;
	readonly icon?: string;
	readonly isExpanded: boolean;
	readonly isOpen: boolean;
	readonly adopted: boolean;
	readonly offline: boolean;
	readonly models: readonly unknown[];
}

export interface PresetProviderRowViewLabels {
	readonly collapseModels: string;
	readonly viewModels: string;
	readonly enabled: string;
	readonly deprecated: string;
	readonly modelsCount: (count: number) => string;
	readonly collapse: string;
	readonly changeKey: string;
	readonly remove: string;
	readonly enable: string;
	readonly apiKeyDirect: (name: string) => string;
	readonly save: string;
}

export interface PresetProviderRowViewProps {
	readonly row: PresetProviderRowModelView;
	readonly draftKey: string;
	readonly saving: boolean;
	readonly labels: PresetProviderRowViewLabels;
	readonly onToggleExpanded: () => void;
	readonly onToggleEditor: () => void;
	readonly onDraftKeyChange: (key: string) => void;
	readonly onAdopt: () => void;
	readonly onRemove: () => void;
	readonly icon: ReactNode;
	readonly modelsList?: ReactNode;
}

export function PresetProviderRowView({
	row,
	draftKey,
	saving,
	labels,
	onToggleExpanded,
	onToggleEditor,
	onDraftKeyChange,
	onAdopt,
	onRemove,
	icon,
	modelsList,
}: PresetProviderRowViewProps): JSX.Element {
	return (
		<div className="border-b border-border last:border-b-0">
			<div className="flex items-center gap-3 px-5 py-3.5">
				<button
					type="button"
					onClick={onToggleExpanded}
					className="flex min-w-0 flex-1 items-center gap-3 text-left"
					title={row.isExpanded ? labels.collapseModels : labels.viewModels}
				>
					<span
						className={cn(
							"icon-[mdi--chevron-right] h-4 w-4 shrink-0 text-muted-foreground transition-transform",
							row.isExpanded && "rotate-90",
						)}
					/>
					{icon}
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
							<Button variant="ghost" size="sm" onClick={onToggleEditor}>
								{row.isOpen ? labels.collapse : labels.changeKey}
							</Button>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={onRemove}
								title={labels.remove}
								className="text-muted-foreground hover:text-destructive"
							>
								<span className="icon-[mdi--delete-outline] h-3.5 w-3.5" />
							</Button>
						</>
					) : (
						<Button variant="primary" size="sm" onClick={onToggleEditor} disabled={row.offline}>
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
							<InputField
								value={draftKey}
								onChange={onDraftKeyChange}
								placeholder="sk-..."
								type="password"
							/>
						</div>
						<Button
							variant="primary"
							size="sm"
							onClick={onAdopt}
							disabled={!draftKey.trim() || saving}
						>
							{row.adopted ? labels.save : labels.enable}
						</Button>
					</div>
				</div>
			)}

			{row.isExpanded && modelsList}
		</div>
	);
}
