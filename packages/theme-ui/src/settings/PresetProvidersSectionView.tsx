import type { JSX, ReactNode } from "react";
import { Switch } from "@vetta/ui";
import { SettingSection, type SettingSectionMeta } from "./SettingChrome";

export interface PresetProvidersSectionViewLabels {
	readonly title: string;
	readonly clickRetry: string;
	readonly loading: string;
	readonly noPresetProviders: string;
	readonly showAllModels: string;
	readonly showAllModelsHint: string;
}

export interface PresetProvidersSectionViewProps {
	readonly section: SettingSectionMeta;
	readonly labels: PresetProvidersSectionViewLabels;
	readonly error: string | null;
	readonly hasRows: boolean;
	readonly loading: boolean;
	readonly rows: ReactNode;
	readonly showAllModels: boolean;
	readonly togglingShowAll: boolean;
	readonly onToggleShowAllModels: (showAll: boolean) => void;
}

export function PresetProvidersSectionView({
	section,
	labels,
	error,
	hasRows,
	loading,
	rows,
	showAllModels,
	togglingShowAll,
	onToggleShowAllModels,
}: PresetProvidersSectionViewProps): JSX.Element {
	return (
		<div className="mt-6">
			<SettingSection section={section} title={labels.title}>
				<div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
					<div className="min-w-0">
						<div className="text-[13px] text-foreground">{labels.showAllModels}</div>
						<div className="mt-0.5 text-[11px] text-muted-foreground">{labels.showAllModelsHint}</div>
					</div>
					<Switch checked={showAllModels} disabled={togglingShowAll} onCheckedChange={onToggleShowAllModels} />
				</div>
				{error && !hasRows && (
					<div className="flex items-center gap-2 px-5 py-3 text-[12px] text-amber-400">
						<span className="icon-[mdi--alert-circle-outline] h-3.5 w-3.5 shrink-0" />
						{error}，{labels.clickRetry}
					</div>
				)}
				{!hasRows && !error && (
					<div className="px-5 py-6 text-center text-[12px] text-muted-foreground">
						{loading ? labels.loading : labels.noPresetProviders}
					</div>
				)}
				{rows}
			</SettingSection>
		</div>
	);
}
