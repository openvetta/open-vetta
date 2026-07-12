import type { JSX, ReactNode } from "react";

export interface ImLegacyImportBannerViewProps {
	readonly title: string;
	readonly pathLine: string;
	readonly appIdSuffix?: string | null;
	/** Host injects import / skip buttons. */
	readonly actions: ReactNode;
}

/**
 * Props-only IM legacy import banner. Host Button chrome via `actions` slot.
 */
export function ImLegacyImportBannerView({
	title,
	pathLine,
	appIdSuffix,
	actions,
}: ImLegacyImportBannerViewProps): JSX.Element {
	return (
		<div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-[12px] text-foreground">
			<div className="mb-2 font-medium">{title}</div>
			<div className="mb-3">
				{pathLine}
				{appIdSuffix ? <span className="ml-2 text-primary">{appIdSuffix}</span> : null}
			</div>
			<div className="flex gap-2">{actions}</div>
		</div>
	);
}
