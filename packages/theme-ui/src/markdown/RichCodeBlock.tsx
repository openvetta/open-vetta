import { useMarkdownHost } from "./host";
import { Button } from "@vetta-org/ui";
import { memo, useEffect, useMemo, useState } from "react";
import { CodeBlock } from "./CodeBlock";
import type { MarkdownCodeBlockProps } from "./definition";
import { createPreviewDocument, MARKDOWN_PREVIEW_FRAME_NAME, MAX_PREVIEW_LENGTH } from "./preview-policy";
import { defaultRichContentLabels } from "./rich-labels";
import { SvgPreview } from "./SvgPreview";
import { useRichVisibility } from "./use-rich-visibility";

/** Product recipe; source/copy retain the existing CodeBlock primitives. */
export const RichCodeBlock = memo(function RichCodeBlock(props: MarkdownCodeBlockProps) {
	const { code, lang, live = false } = props;
	const host = useMarkdownHost();
	const [failed, setFailed] = useState(false);
	const labels = props.labels.rich ?? defaultRichContentLabels;
	const svg = lang.toLowerCase() === "svg";
	const { ref, active } = useRichVisibility<HTMLDivElement>();
	const [showSource, setShowSource] = useState(false);
	const [runSource, setRunSource] = useState<string | null>(null);
	const [paused, setPaused] = useState(false);
	const oversized = code.length > MAX_PREVIEW_LENGTH;
	const running = runSource === code && active && !live && !showSource;
	useEffect(() => {
		if (!active || live || showSource || (runSource !== null && runSource !== code)) {
			if (runSource !== null) setPaused(true);
			setRunSource(null);
		}
	}, [active, live, showSource, code, runSource]);
	useEffect(() => {
		if (!running) return;
		// Main owns the hard timeout; this timer only updates the local controls.
		const timeout = setTimeout(() => {
			setRunSource(null);
			setPaused(true);
		}, 30_000);
		return () => clearTimeout(timeout);
	}, [running]);
	useEffect(() => {
		if (!running || !host) return;
		let cancelled = false;
		let stop: (() => void) | undefined;
		setFailed(false);
		void host.openHtml(code).then((close) => {
			if (cancelled) close(); else stop = close;
		}, () => { if (!cancelled) { setFailed(true); setRunSource(null); } });
		return () => { cancelled = true; stop?.(); };
	}, [running, code, host]);
	const srcDoc = useMemo(
		() => (active && !svg && !live && !oversized && !showSource ? createPreviewDocument(code) : ""),
		[active, svg, live, oversized, showSource, code],
	);
	return (
		<CodeBlock.Root {...props}>
			<CodeBlock.Copy>
				<CodeBlock.Frame>
					<div ref={ref}>
						<div className="flex flex-wrap items-center gap-2 py-1.5 pr-12 pl-4">
							<span className="text-[12px] text-muted-foreground">{svg ? "SVG" : "HTML"}</span>
							<Button variant="ghost" size="sm" aria-pressed={showSource} onClick={() => setShowSource(!showSource)}>
								{showSource ? labels.preview : labels.source}
							</Button>
							{host && !svg && !showSource && !live && !oversized && (
								<Button
									variant="ghost"
									size="sm"
									onClick={() => {
										setPaused(running);
										setRunSource(running ? null : code);
									}}
								>
									{running ? labels.stop : labels.run}
								</Button>
							)}
						</div>
						{live || oversized || showSource ? (
							<>
								{!showSource && (
									<p className="px-4 pb-2 text-[12px] text-muted-foreground">
										{oversized ? labels.tooLarge : labels.waiting}
									</p>
								)}
								{oversized ? (
									<CodeBlock.Body>
										<pre className="max-h-96 overflow-auto py-3 pr-4 pl-5 text-[13px]">
											<code>{code}</code>
										</pre>
									</CodeBlock.Body>
								) : (
									<CodeBlock.Content />
								)}
							</>
						) : svg ? (
							<CodeBlock.Body>
								<div className="p-4">
									<SvgPreview source={code} label={labels.svg} failed={labels.failed} />
								</div>
							</CodeBlock.Body>
						) : (
							<>
								<p className="px-4 pb-2 text-[12px] text-muted-foreground">
									{failed ? labels.failed : running ? labels.running : paused ? labels.paused : labels.staticHtml}
								</p>
								<CodeBlock.Body>
									{srcDoc ? (
										<iframe
											key="static"
											name={MARKDOWN_PREVIEW_FRAME_NAME}
											title={labels.html}
											srcDoc={srcDoc}
											sandbox=""
											referrerPolicy="no-referrer"
											allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'"
											className="h-80 w-full border-0"
										/>
									) : (
										<div className="h-80" aria-hidden="true" />
									)}
								</CodeBlock.Body>
							</>
						)}
					</div>
				</CodeBlock.Frame>
			</CodeBlock.Copy>
		</CodeBlock.Root>
	);
});
