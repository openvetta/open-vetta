import type { JSX } from "react";

export function SettingsContentLoadingView(): JSX.Element {
	return (
		<div className="mx-auto flex w-full max-w-[680px] flex-col px-8 pb-8 pt-2" aria-busy="true">
			<div className="h-7 w-36 animate-pulse rounded-lg bg-foreground/10" />
			<div className="mt-2 h-3 w-72 max-w-full animate-pulse rounded bg-foreground/5" />
			<div className="mt-7 space-y-3">
				{Array.from({ length: 4 }, (_, index) => (
					<div
						key={index}
						className="h-20 animate-pulse rounded-xl border border-border/40 bg-card/30"
					/>
				))}
			</div>
		</div>
	);
}
