import { useTranslation } from "@vetta/plugin-sdk";
import type { CommitNode } from "../../git/types";
import { CopyIcon } from "../icons";
import { CommitMessage } from "./CommitMessage";

/** Metadata header for a commit: subject, body, short hash (copyable), author, date. */
export function CommitMeta({ node }: { node: CommitNode }): JSX.Element {
	const { t, locale } = useTranslation();
	const shortHash = node.hash.slice(0, 8);
	const date = node.timestamp ? new Date(node.timestamp * 1000).toLocaleString(locale) : "";

	return (
		<div className="shrink-0 border-b border-border px-3 py-2.5">
			<div className="text-[13px] font-medium leading-snug text-foreground">{node.subject}</div>
			{node.body.trim() && (
				<div className="mt-1.5">
					<CommitMessage body={node.body.trim()} />
				</div>
			)}
			<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
				<button
					type="button"
					onClick={() => void navigator.clipboard?.writeText(node.hash)}
					title={t("commit.copyHash")}
					className="git-mono inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
				>
					<span>{shortHash}</span>
					<CopyIcon className="h-3 w-3" />
				</button>
				<span className="truncate" title={`${node.authorName} <${node.authorEmail}>`}>
					{node.authorName}
				</span>
				{date && <span>{date}</span>}
			</div>
		</div>
	);
}
