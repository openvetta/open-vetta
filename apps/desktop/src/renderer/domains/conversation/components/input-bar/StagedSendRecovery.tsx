import { Button } from "@shared/components/ui/button";
import { activeInputDraftKeyAtom, browserCapturesAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
	recoveryComposerEmptyAtom,
	restoreRetainedSend,
	stagedSendRecoveriesAtom,
} from "../../services/staged-new-session-send";

export function StagedSendRecovery() {
	const { t } = useTranslation("chat");
	const recoveries = useAtomValue(stagedSendRecoveriesAtom);
	const scope = useAtomValue(activeInputDraftKeyAtom);
	const empty = useAtomValue(recoveryComposerEmptyAtom);
	const currentCaptures = useAtomValue(browserCapturesAtom);
	return (
		<>
			{[...recoveries.values()]
				.filter(({ draftKey }) => draftKey === scope)
				.map(({ staged }) => {
					const id = staged.optimisticMessage.id;
					const captures = staged.browserCaptures ?? [];
					const hasMissingCapture = captures.some(
						(item) => !currentCaptures.some((existing) => existing.id === item.id),
					);
					return (
						<details
							key={id}
							className="mx-auto mb-1 w-full max-w-2xl rounded-lg border border-border bg-card px-3 py-2 text-xs"
						>
							<summary className="cursor-pointer truncate">
								{t("browserCapture.unsentDraft")} · {staged.rawText || captures[0]?.title || captures[0]?.url}
							</summary>
							<div className="mt-2 max-h-40 space-y-1 overflow-auto">
								<p className="whitespace-pre-wrap break-words">{staged.rawText}</p>
								{captures.map((capture) => (
									<p key={capture.id} className="break-words">
										{capture.title || capture.url} · {capture.note}
									</p>
								))}
								{staged.mentionedFiles.map((file) => (
									<p key={file.path}>{file.name}</p>
								))}
								{staged.attachedImages.map((image) => (
									<p key={image.id}>{image.name}</p>
								))}
								{staged.appshot && <p>{staged.appshot.imagePath || staged.appshot.textPath}</p>}
							</div>
							{!empty && <p className="mt-2 text-muted-foreground">{t("browserCapture.restoreWhenEmpty")}</p>}
							<div className="mt-1 flex flex-wrap gap-1">
								<Button size="sm" variant="outline" disabled={!empty} onClick={() => restoreRetainedSend(id, "full")}>
									{t("browserCapture.restoreDraft")}
								</Button>
								{!empty && hasMissingCapture && (
									<Button size="sm" variant="outline" onClick={() => restoreRetainedSend(id, "captures")}>
										{t("browserCapture.restoreScreenshots")}
									</Button>
								)}
								<Button size="sm" variant="ghost" onClick={() => restoreRetainedSend(id, "dismiss")}>
									{t("browserCapture.discardDraft")}
								</Button>
							</div>
						</details>
					);
				})}
		</>
	);
}
