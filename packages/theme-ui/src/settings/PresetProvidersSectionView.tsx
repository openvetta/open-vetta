import type { JSX, ReactNode } from "react";
import { Button } from "@vetta/ui";
import { cn } from "@vetta/ui";
import { SettingSection, type SettingSectionMeta } from "./SettingChrome";

export interface PresetProvidersSectionViewLabels {
	readonly title: string;
	readonly clickRetry: string;
	readonly loading: string;
	readonly noPresetProviders: string;
	readonly refresh: string;
	readonly refreshing: string;
}

export interface PresetProvidersSectionViewProps {
	readonly section: SettingSectionMeta;
	readonly labels: PresetProvidersSectionViewLabels;
	readonly error: string | null;
	readonly hasRows: boolean;
	readonly loading: boolean;
	readonly onReload: () => void;
	readonly rows: ReactNode;
}

export function PresetProvidersSectionView({
	section,
	labels,
	error,
	hasRows,
	loading,
	onReload,
	rows,
}: PresetProvidersSectionViewProps): JSX.Element {
	return (
		<div className="mt-6">
			<SettingSection
				section={section}
				title={
					<div className="flex items-center justify-between">
						<span>{labels.title}</span>
						<Button variant="ghost" size="sm" onClick={onReload} disabled={loading}>
							<span className={cn("icon-[mdi--refresh] h-3.5 w-3.5", loading && "animate-spin")} />
							{loading ? labels.refreshing : labels.refresh}
						</Button>
					</div>
				}
			>
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
