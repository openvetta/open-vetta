import { useTranslation } from "react-i18next";
import { lineCount } from "./format";

export function TextPreview({
	label,
	text,
	emptyLabel,
}: {
	label: string;
	text: string;
	emptyLabel?: string;
}): JSX.Element {
	const { t } = useTranslation("chat");
	const lines = lineCount(text);
	const resolvedEmptyLabel = emptyLabel ?? t("textPreview.emptyLabel");
	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
				<span className="font-medium text-muted-foreground/60">{label}</span>
				<span>
					{lines} {t("textPreview.lineUnit")} · {text.length}{" "}
					{t("textPreview.characterUnit")}
				</span>
			</div>
			<pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/25 p-2 text-[11px] leading-[1.5] text-foreground/70">
				{text.length > 0 ? text : resolvedEmptyLabel}
			</pre>
		</div>
	);
}
