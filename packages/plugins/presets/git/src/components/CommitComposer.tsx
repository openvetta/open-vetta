import { useTranslation } from "@vetta-org/plugin-sdk";
import { Button } from "@vetta-org/ui";
import { useCallback, useState } from "react";
import { commitAllChanges, generateCommitMessage } from "../git/commit";
import { sanitizeCommitMessage } from "../git/commit-message";
import { emitRefreshSignal, getGitAi } from "../git/runtime";
import type { ChangeEntry } from "../git/types";
import { SparkleIcon } from "./icons";

type BusyKind = "generate" | "commit";

export function CommitComposer({
	root,
	entries,
}: {
	root: string;
	entries: readonly ChangeEntry[];
}): JSX.Element {
	const { t } = useTranslation();
	const [draft, setDraft] = useState("");
	const [busy, setBusy] = useState<BusyKind | null>(null);
	const [error, setError] = useState<string | null>(null);

	const handleGenerate = useCallback(() => {
		if (busy) return;
		setBusy("generate");
		setError(null);
		void generateCommitMessage({
			root,
			entries,
			complete: (request) => getGitAi().complete(request),
		})
			.then((message) => {
				if (!message) {
					setError(t("commit.generate.empty"));
					return;
				}
				setDraft(message);
			})
			.catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
			.finally(() => setBusy(null));
	}, [busy, entries, root, t]);

	const handleCommit = useCallback(() => {
		if (busy) return;
		const message = sanitizeCommitMessage(draft);
		if (!message) {
			setError(t("commit.empty"));
			return;
		}
		setBusy("commit");
		setError(null);
		void commitAllChanges(root, message)
			.then(() => {
				setDraft("");
				emitRefreshSignal();
			})
			.catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
			.finally(() => setBusy(null));
	}, [busy, draft, root, t]);

	return (
		<div className="shrink-0 border-t border-border p-2">
			<textarea
				className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/60"
				rows={3}
				placeholder={t("commit.placeholder")}
				aria-label={t("commit.placeholder")}
				value={draft}
				disabled={busy !== null}
				onChange={(event) => setDraft(event.target.value)}
			/>
			<div className="mt-1.5 flex items-center justify-end gap-1.5">
				<Button
					type="button"
					variant="ghost"
					size="xs"
					disabled={busy !== null}
					title={t("commit.generate")}
					aria-label={t("commit.generate")}
					onClick={handleGenerate}
				>
					<SparkleIcon className={`h-3.5 w-3.5 ${busy === "generate" ? "animate-spin" : ""}`} />
					{busy === "generate" ? t("commit.generating") : t("commit.generate")}
				</Button>
				<Button type="button" variant="primary" size="xs" disabled={busy !== null} onClick={handleCommit}>
					{busy === "commit" ? t("commit.committing") : t("commit.submit")}
				</Button>
			</div>
			{error && <p className="mt-1 text-[12px] text-rose-500">{error}</p>}
		</div>
	);
}
