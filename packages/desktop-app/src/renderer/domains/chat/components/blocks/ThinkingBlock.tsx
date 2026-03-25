import { useState } from "react";

interface ThinkingBlockProps {
	text: string;
}

export function ThinkingBlockView({ text }: ThinkingBlockProps): JSX.Element {
	const [expanded, setExpanded] = useState(false);
	const lines = text.split("\n");
	const preview = lines.slice(0, 3).join("\n");
	const hasMore = lines.length > 3;

	return (
		<div className="my-1 rounded-lg border border-border bg-muted px-3 py-2">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex w-full items-center gap-1.5 text-left text-[11px] font-medium text-muted-foreground/50"
			>
				<span className="icon-[mdi--lightbulb-outline] h-3 w-3 shrink-0 text-muted-foreground" />
				Thinking
				{hasMore && (
					<span className="ml-auto text-[10px]">
						{expanded ? "collapse" : `${lines.length} lines`}
					</span>
				)}
			</button>
			<div
				className="mt-1.5 whitespace-pre-wrap break-words text-[12px] italic leading-[1.5] text-muted-foreground"
			>
				{expanded || !hasMore ? text : `${preview}\n...`}
			</div>
		</div>
	);
}
