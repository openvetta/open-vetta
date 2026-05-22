import { lineCount } from "./format";

export function TextPreview({
	label,
	text,
	emptyLabel = "空内容",
}: {
	label: string;
	text: string;
	emptyLabel?: string;
}): JSX.Element {
	const lines = lineCount(text);
	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
				<span className="font-medium text-muted-foreground/60">{label}</span>
				<span>
					{lines} 行 · {text.length} 字符
				</span>
			</div>
			<pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/25 p-2 text-[11px] leading-[1.5] text-foreground/70">
				{text.length > 0 ? text : emptyLabel}
			</pre>
		</div>
	);
}
