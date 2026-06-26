import type { ToolCallBlock } from "@shared/store/atoms";
import { useTranslation } from "react-i18next";
import { formatSignedCount } from "./shared/format";
import { parseDiff } from "./shared/parse-diff";
import { getStringArg } from "./shared/parse-tool";
import { TextPreview } from "./shared/TextPreview";

function DiffPreview({ diff }: { diff: string }): JSX.Element {
	const { t } = useTranslation("chat");
	const { lines, stats } = parseDiff(diff);
	const net = stats.added - stats.removed;

	return (
		<div className="space-y-1.5">
			<div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/50">
				<span className="font-medium text-muted-foreground/60">diff</span>
				<span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-600 dark:text-emerald-400">
					+{stats.added}
				</span>
				<span className="rounded bg-red-500/10 px-1.5 py-0.5 font-medium text-red-600 dark:text-red-400">
					-{stats.removed}
				</span>
				<span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground/60">{t("editDiff.netChangeLabel", { net: formatSignedCount(net) })}</span>
			</div>
			<div className="max-h-[420px] overflow-auto rounded-md bg-muted/25 py-2 font-mono text-[11px] leading-[1.5]">
				{lines.map((line, index) => {
					const rowClass =
						line.kind === "added"
							? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
							: line.kind === "removed"
								? "bg-red-500/10 text-red-700 dark:text-red-300"
								: line.kind === "meta"
									? "text-muted-foreground/45"
									: "text-foreground/70";
					const markerClass =
						line.kind === "added"
							? "text-emerald-600 dark:text-emerald-400"
							: line.kind === "removed"
								? "text-red-600 dark:text-red-400"
								: "text-muted-foreground/35";
					const marker = line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " ";
					const content = line.kind === "added" || line.kind === "removed" ? line.text.slice(1) : line.text;
					return (
						<div key={`${index}-${line.text}`} className={`flex min-w-max px-2 ${rowClass}`}>
							<span className={`w-4 shrink-0 select-none ${markerClass}`}>{marker}</span>
							<span className="whitespace-pre">{content}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function EditTextFallback({ block }: { block: ToolCallBlock }): JSX.Element | null {
	const { t } = useTranslation("chat");
	const oldText = getStringArg(block.args, "oldText");
	const newText = getStringArg(block.args, "newText");
	if (oldText === null && newText === null) return null;

	return (
		<div className="space-y-3">
			{oldText !== null && <TextPreview label="oldText" text={oldText} emptyLabel={t("editDiff.oldTextEmpty")} />}
			{newText !== null && <TextPreview label="newText" text={newText} emptyLabel={t("editDiff.newTextEmpty")} />}
		</div>
	);
}

export function EditDiffView({ block }: { block: ToolCallBlock }): JSX.Element | null {
	if (block.uiDetails?.diff) return <DiffPreview diff={block.uiDetails.diff} />;
	return <EditTextFallback block={block} />;
}
