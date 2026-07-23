import type { JSX, ReactNode } from "react";
import { SettingSection, type SettingSectionMeta } from "./SettingChrome";

export interface PresetProvidersSectionViewLabels {
	readonly title: string;
	readonly clickRetry: string;
	readonly loading: string;
	readonly noPresetProviders: string;
}

export interface PresetProvidersSectionViewProps {
	readonly section: SettingSectionMeta;
	readonly labels: PresetProvidersSectionViewLabels;
	readonly error: string | null;
	readonly hasRows: boolean;
	readonly loading: boolean;
	readonly rows: ReactNode;
}

export function PresetProvidersSectionView({
	section,
	labels,
	error,
	hasRows,
	loading,
	rows,
}: PresetProvidersSectionViewProps): JSX.Element {
	return (
		<div className="mt-6">
			<SettingSection section={section} title={labels.title}>
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
