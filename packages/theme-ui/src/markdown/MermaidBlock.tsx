import { Button } from "@vetta-org/ui";
import type { MouseEvent } from "react";
import { memo, useEffect, useState } from "react";
import { CodeBlock } from "./CodeBlock";
import type { MarkdownCodeBlockProps } from "./definition";
import { useMarkdownHost } from "./host";
import { useImageActions } from "./image-actions";
import { svgImageSource, withBackground, withIntrinsicSize } from "./preview-policy";
import { defaultRichContentLabels } from "./rich-labels";
import { useRichVisibility } from "./use-rich-visibility";

/**
 * Mermaid's dark theme renders poorly, so diagrams always use the light palette.
 * In dark mode they sit on a soft gray canvas instead of a glaring white one.
 */
const DARK_MODE_CANVAS = "#e4e4e7";
/** Copies and saved files are shared elsewhere; a transparent diagram looks broken there. */
const EXPORT_CANVAS = "#ffffff";

function DiagramAction({ label, icon, disabled, onClick }: { label: string; icon: string; disabled?: boolean; onClick: () => void }) {
	const handle = (event: MouseEvent<HTMLButtonElement>) => {
		event.preventDefault();
		event.stopPropagation();
		onClick();
	};
	return (
		<Button variant="ghost" size="icon-sm" aria-label={label} title={label} disabled={disabled} onClick={handle} className="text-muted-foreground hover:text-foreground">
			<span className={`${icon} h-4 w-4`} />
		</Button>
	);
}

export const MermaidBlock = memo(function MermaidBlock(props: MarkdownCodeBlockProps) {
	const { code, theme, live } = props;
	const host = useMarkdownHost();
	const labels = props.labels.rich ?? defaultRichContentLabels;
	const { ref, active } = useRichVisibility<HTMLDivElement>();
	const [source, setSource] = useState(false);
	const [attempt, setAttempt] = useState(0);
	const [result, setResult] = useState<{ key: string; svg: string | null }>();
	const oversized = code.length > 12_000;
	useEffect(() => {
		if (!host || !active || live || source || oversized) return;
		let cancelled = false;
		void host.renderMermaid(code, "light").then(
			(svg) => { if (!cancelled) setResult({ key: code, svg }); },
			() => { if (!cancelled) setResult({ key: code, svg: null }); },
		);
		return () => { cancelled = true; };
	}, [host, active, live, source, oversized, code, attempt]);
	const current = result?.key === code ? result : undefined;
	const dark = theme === "dark";
	const image = current?.svg ? svgImageSource(withIntrinsicSize(dark ? withBackground(current.svg, DARK_MODE_CANVAS) : current.svg)) : null;
	const exported = current?.svg ? svgImageSource(withIntrinsicSize(withBackground(current.svg, EXPORT_CANVAS))) : null;
	const { action, setAction, run, busy } = useImageActions(host, exported ?? undefined, code);
	useEffect(() => {
		if (action !== "copied") return;
		const timer = setTimeout(() => setAction(null), 1500);
		return () => clearTimeout(timer);
	}, [action, setAction]);
	const showing = !(source || live || oversized || !host || current?.svg === null);
	const diagram = labels.diagram ?? "Diagram";
	return <CodeBlock.Root {...props}><CodeBlock.Copy><CodeBlock.Frame><div ref={ref}>
		<div className="flex items-center gap-2 py-1.5 pr-12 pl-4">
			<span className="text-[12px] text-muted-foreground">Mermaid</span>
			<Button variant="ghost" size="sm" aria-pressed={source} onClick={() => setSource(!source)}>{source ? labels.preview : labels.source}</Button>
			{current?.svg === null && <Button variant="ghost" size="sm" onClick={() => { setResult(undefined); setAttempt((value) => value + 1); }}>{labels.retry ?? "Retry"}</Button>}
			{showing && image && host && <div className="ml-auto flex items-center gap-0.5">
				{action === "failed" && <span role="status" className="mr-1 text-[12px] text-muted-foreground">{labels.actionFailed ?? labels.failed}</span>}
				<div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/code-block:opacity-100 focus-within:opacity-100">
					<DiagramAction label={labels.enlarge ?? "Enlarge"} icon="icon-[solar--maximize-square-minimalistic-linear]" onClick={() => host.openImage(image, diagram)} />
					<DiagramAction label={action === "copied" ? props.labels.copied : (labels.copyImage ?? "Copy image")} icon={action === "copied" ? "icon-[mdi--check]" : "icon-[solar--gallery-send-linear]"} disabled={busy} onClick={() => void run("copy")} />
					<DiagramAction label={labels.save ?? "Save"} icon="icon-[solar--download-minimalistic-linear]" disabled={busy} onClick={() => void run("save")} />
				</div>
			</div>}
		</div>
		{!showing ? <>
			{!source && <p role="status" className="px-4 pb-2 text-[12px] text-muted-foreground">{oversized ? labels.tooLarge : live ? labels.waiting : labels.failed}</p>}
			<CodeBlock.Content />
		</> : image ? <CodeBlock.Body><div className="overflow-x-auto p-4" style={dark ? { backgroundColor: DARK_MODE_CANVAS } : undefined}><img src={image} alt={diagram} decoding="async" className="mx-auto block h-auto max-w-full" /></div></CodeBlock.Body> : <CodeBlock.Body><div className="min-h-24 p-4" role="status">{labels.loading ?? labels.waiting}</div></CodeBlock.Body>}
	</div></CodeBlock.Frame></CodeBlock.Copy></CodeBlock.Root>;
});
