import { Button } from "@vetta-org/ui";
import { useState } from "react";

export interface BrowserCaptureCardViewProps {
	src: string;
	title: string;
	note: string;
	labels: { preview: string; note: string; remove: string; unavailable: string };
	onPreview: () => void;
	onNoteChange?: (note: string) => void;
	onRemove?: () => void;
}

/** Image and its annotation remain a single attachment in the composer and history. */
export function BrowserCaptureCardView({
	src,
	title,
	note,
	labels,
	onPreview,
	onNoteChange,
	onRemove,
}: BrowserCaptureCardViewProps) {
	const [failedSource, setFailedSource] = useState<string | null>(null);
	return (
		<article className="flex w-full max-w-md gap-3 rounded-xl border border-border bg-card/40 p-3">
			<Button
				variant="ghost"
				className="h-20 w-28 shrink-0 overflow-hidden p-0"
				onClick={onPreview}
				aria-label={labels.preview}
			>
				{failedSource === src ? (
					<span className="text-xs text-muted-foreground">{labels.unavailable}</span>
				) : (
					<img
						src={src}
						alt={title}
						onError={() => setFailedSource(src)}
						className="h-full w-full object-contain"
					/>
				)}
			</Button>
			<div className="min-w-0 flex-1 space-y-1">
				<p className="truncate text-xs text-muted-foreground" title={title}>
					{title}
				</p>
				{onNoteChange ? (
					<textarea
						aria-label={labels.note}
						placeholder={labels.note}
						value={note}
						maxLength={10000}
						onChange={(event) => onNoteChange(event.target.value)}
						className="min-h-14 w-full resize-y rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-inset focus:ring-ring"
					/>
				) : (
					<p className="whitespace-pre-wrap break-words text-sm">{note}</p>
				)}
			</div>
			{onRemove ? (
				<Button variant="ghost" size="icon" aria-label={labels.remove} onClick={onRemove}>
					<span className="icon-[solar--close-circle-linear] h-4 w-4" />
				</Button>
			) : null}
		</article>
	);
}
