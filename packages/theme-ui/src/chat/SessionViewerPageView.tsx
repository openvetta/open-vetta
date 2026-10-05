import { Button } from "@vetta-org/ui";
import type { JSX, ReactNode } from "react";

export interface SessionViewerPageViewProps {
	rootClassName?: string;
	emptyPathLabel: string;
	error: string | null;
	errorPrefix: string;
	hasPath: boolean;
	loading?: boolean;
	loadingLabel?: string;
	retryLabel?: string;
	onRetry?: () => void;
	/** Off-screen export host when exporting. */
	exportHost: ReactNode;
	/** Main message list. */
	messageList: ReactNode;
	/** Activity panel (IM or knowledge). */
	activityPanel: ReactNode;
}

/**
 * Read-only session viewer shell. Host supplies MessageList / ActivityPanel / export slots.
 */
export function SessionViewerPageView({
	rootClassName,
	emptyPathLabel,
	error,
	errorPrefix,
	hasPath,
	loading = false,
	loadingLabel,
	retryLabel,
	onRetry,
	exportHost,
	messageList,
	activityPanel,
}: SessionViewerPageViewProps): JSX.Element {
	if (!hasPath) {
		return (
			<div className="flex h-full min-h-0 flex-1 items-center justify-center text-[13px] text-muted-foreground">
				{emptyPathLabel}
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-[13px]">
				<p role="alert" className="max-w-full whitespace-pre-wrap break-words text-destructive">
					{errorPrefix}
					{error}
				</p>
				{onRetry && retryLabel && (
					<Button variant="outline" onClick={onRetry}>
						{retryLabel}
					</Button>
				)}
			</div>
		);
	}

	return (
		<div className={rootClassName}>
			{exportHost}
			<div className="flex min-h-0 flex-1 gap-2 overflow-visible">
				<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
					{loading ? (
						<output
							aria-busy="true"
							className="flex min-h-0 flex-1 items-center justify-center p-8 text-[13px] text-muted-foreground"
						>
							{loadingLabel}
						</output>
					) : (
						messageList
					)}
				</div>
				{activityPanel}
			</div>
		</div>
	);
}
