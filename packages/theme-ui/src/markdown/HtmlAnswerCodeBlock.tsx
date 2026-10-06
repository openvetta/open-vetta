import { Button } from "@vetta-org/ui";
import { useEffect, useId, useRef, useState } from "react";
import { HtmlPreviewView } from "../activity/HtmlPreviewView";
import { SyntaxHighlightedCode } from "../shared/SyntaxHighlightedCode";
import type { HtmlAnswerLabels, MarkdownCodeBlockProps } from "./definition";
import { MAX_HTML_PREVIEW_LENGTH } from "./html-answer";

type View = "preview" | "source";

/** A document inside the message body, with no file/activity-panel actions. */
export function HtmlAnswerCodeBlock(props: MarkdownCodeBlockProps) {
	const labels = props.labels.html;
	if (!labels) return null;
	return <HtmlAnswerDocument {...props} htmlLabels={labels} />;
}

function HtmlAnswerDocument({
	code,
	lang,
	theme,
	labels,
	htmlLabels,
	live,
	streaming,
	closed,
}: MarkdownCodeBlockProps & { htmlLabels: HtmlAnswerLabels }) {
	const [choice, setChoice] = useState<View | null>(null);
	const [expanded, setExpanded] = useState(false);
	const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
	const alive = useRef(true);
	const sourceVersion = useRef(0);
	const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const contentId = useId();
	const pending = streaming ?? live ?? false;
	const tooLarge = code.length > MAX_HTML_PREVIEW_LENGTH;
	const ready = !pending && !!closed && !!code.trim() && !tooLarge;
	const view = choice ?? (lang.toLowerCase() === "html-preview" ? "preview" : "source");
	const [openedPreview, setOpenedPreview] = useState(false);
	const [previousDocument, setPreviousDocument] = useState({ code, lang, pending });
	if (previousDocument.code !== code || previousDocument.lang !== lang || previousDocument.pending !== pending) {
		setPreviousDocument({ code, lang, pending });
		setCopyState("idle");
		// New generations reset old choices once, not on every streaming delta.
		if (
			previousDocument.lang !== lang ||
			(!previousDocument.pending && pending) ||
			(previousDocument.code !== code && !pending)
		) {
			setChoice(null);
			setExpanded(false);
			setOpenedPreview(false);
		}
	}
	const showPreview = ready && view === "preview";
	// Inspecting source keeps the same isolated document and its native state.
	useEffect(() => {
		if (showPreview) setOpenedPreview(true);
	}, [showPreview]);
	useEffect(() => {
		alive.current = true;
		sourceVersion.current++;
		return () => {
			alive.current = false;
			sourceVersion.current++;
			clearTimeout(copyTimer.current);
		};
	}, [code]);
	async function copySource() {
		const version = sourceVersion.current;
		try {
			await navigator.clipboard.writeText(code);
			if (!alive.current || version !== sourceVersion.current) return;
			setCopyState("copied");
			clearTimeout(copyTimer.current);
			copyTimer.current = setTimeout(() => setCopyState("idle"), 1500);
		} catch {
			if (alive.current && version === sourceVersion.current) setCopyState("failed");
		}
	}
	const status = pending ? htmlLabels.waiting : tooLarge ? htmlLabels.tooLarge : !ready ? htmlLabels.incomplete : null;
	return (
		<section
			aria-label={htmlLabels.title}
			className="my-2 min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-card"
		>
			<div className="flex min-w-0 flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
				<span className="mr-auto text-[12px] font-medium text-muted-foreground">{htmlLabels.title}</span>
				<Button
					size="xs"
					variant={view === "preview" ? "secondary" : "ghost"}
					aria-pressed={view === "preview"}
					aria-controls={contentId}
					disabled={!ready}
					onClick={() => setChoice("preview")}
				>
					{htmlLabels.preview}
				</Button>
				<Button
					size="xs"
					variant={view === "source" ? "secondary" : "ghost"}
					aria-pressed={view === "source"}
					aria-controls={contentId}
					onClick={() => setChoice("source")}
				>
					{htmlLabels.source}
				</Button>
				<Button size="xs" variant="ghost" onClick={copySource}>
					{copyState === "copied" ? labels.copied : labels.copy}
				</Button>
				{showPreview ? (
					<Button
						size="icon-xs"
						variant="ghost"
						title={expanded ? htmlLabels.collapse : htmlLabels.expand}
						aria-label={expanded ? htmlLabels.collapse : htmlLabels.expand}
						aria-expanded={expanded}
						aria-controls={contentId}
						onClick={() => setExpanded((value) => !value)}
					>
						<span
							className={
								expanded
									? "icon-[solar--minimize-square-linear] h-3.5 w-3.5"
									: "icon-[solar--maximize-square-linear] h-3.5 w-3.5"
							}
						/>
					</Button>
				) : null}
			</div>
			{copyState === "failed" ? (
				<p role="alert" className="px-3 py-1.5 text-[12px] text-destructive">
					{htmlLabels.copyFailed}
				</p>
			) : null}
			{status ? <output className="block px-3 py-2 text-[12px] text-muted-foreground">{status}</output> : null}
			<div id={contentId} className="min-w-0">
				{ready && (showPreview || openedPreview) ? (
					<div hidden={!showPreview} style={{ height: expanded ? "min(70vh, 760px)" : "min(52vh, 420px)", minHeight: 220 }}>
						<HtmlPreviewView key={code} content={code} title={htmlLabels.title} theme={theme} />
					</div>
				) : null}
				{view === "source" ? (
					<div className="max-h-96 min-w-0 overflow-auto">
						<SyntaxHighlightedCode code={code} lang="html" theme={theme} live={live} fontSizeClass="text-[13px]" />
					</div>
				) : null}
			</div>
			<p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">{htmlLabels.safety}</p>
		</section>
	);
}
