import {
	DiffPreviewView,
	EditTextFallbackView,
	type DiffLineView,
} from "@vetta/theme-ui/chat";
import { useTranslation } from "react-i18next";
import { formatSignedCount } from "./shared/format";
import { parseDiff } from "./shared/parse-diff";
import { getStringArg } from "./shared/parse-tool";

interface EditDiffBlock {
	args: Record<string, unknown>;
	uiDetails?: { diff?: string };
}

function DiffPreview({ diff }: { diff: string }): JSX.Element {
	const { t } = useTranslation("chat");
	const { lines, stats } = parseDiff(diff);
	const net = stats.added - stats.removed;

	const viewLines: DiffLineView[] = lines.map((line) => {
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
		return {
			text: line.text,
			kind: line.kind,
			marker,
			content,
			rowClass,
			markerClass,
		};
	});

	return (
		<DiffPreviewView
			lines={viewLines}
			statsAdded={stats.added}
			statsRemoved={stats.removed}
			netLabel={t("editDiff.netChangeLabel", { net: formatSignedCount(net) })}
		/>
	);
}

function EditTextFallback({ block }: { block: EditDiffBlock }): JSX.Element | null {
	const { t } = useTranslation("chat");
	const oldText = getStringArg(block.args, "oldText");
	const newText = getStringArg(block.args, "newText");
	if (oldText === null && newText === null) return null;

	return (
		<EditTextFallbackView
			oldText={oldText}
			newText={newText}
			oldTextEmptyLabel={t("editDiff.oldTextEmpty")}
			newTextEmptyLabel={t("editDiff.newTextEmpty")}
			textPreviewLabels={{
				characterUnit: t("textPreview.characterUnit"),
				emptyLabel: t("textPreview.emptyLabel"),
				lineUnit: t("textPreview.lineUnit"),
			}}
		/>
	);
}

/** Desktop adapter: parse tool block + i18n into props-driven theme-ui views. */
export function EditDiffView({ block }: { block: EditDiffBlock }): JSX.Element | null {
	if (block.uiDetails?.diff) return <DiffPreview diff={block.uiDetails.diff} />;
	return <EditTextFallback block={block} />;
}
