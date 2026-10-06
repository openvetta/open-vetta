import type { JSX } from "react";
import { useMemo, useState } from "react";
import { createHtmlPreviewDocument } from "./html-preview-security";

export interface HtmlPreviewViewProps {
	readonly content: string;
	/**
	 * Kept for call-site compatibility. Preview canvas does not follow app theme —
	 * page CSS owns appearance; chrome uses a fixed light document color-scheme.
	 */
	readonly theme?: "light" | "dark";
	/** Accessible name for the iframe. */
	readonly title: string;
}

/**
 * Match apps/site `globals.css` thin scrollbar (6px rounded thumb).
 * Must live inside the iframe document — parent CSS never applies to srcDoc.
 *
 * Why body scroll (not the viewport root):
 * On Windows Chromium, `::-webkit-scrollbar` often fails to style the
 * documentElement/viewport scroller inside iframes, so the OS classic bar
 * shows. Pin html height + scroll body so webkit pseudo-elements apply.
 *
 * Fixed light chrome (not app theme): injecting color-scheme:dark forces UA
 * defaults (canvas/text) onto pages that omit their own background.
 */
function previewChromeStyle(): string {
	const thumb = "rgba(82, 82, 82, 0.28)";
	const thumbHover = "rgba(24, 24, 27, 0.48)";
	return `
:root { color-scheme: light; }
html {
  height: 100%;
  overflow: hidden;
}
/* Override preview HTML min-height:100vh so body is the scroller. */
html body {
  height: 100% !important;
  min-height: 0 !important;
  max-height: 100%;
  overflow-x: auto !important;
  overflow-y: auto !important;
  scrollbar-width: thin;
  scrollbar-color: ${thumb} transparent;
}
html body, html body *, html body *::before, html body *::after { box-sizing: border-box; }
html body img, html body svg { max-width: 100%; }
/* Also style nested overflow nodes (match .vetta-app-ui * on the host). */
html body * {
  scrollbar-width: thin;
  scrollbar-color: ${thumb} transparent;
}
html body::-webkit-scrollbar,
html body *::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
html body::-webkit-scrollbar-track,
html body *::-webkit-scrollbar-track {
  background: transparent;
}
html body::-webkit-scrollbar-thumb,
html body *::-webkit-scrollbar-thumb {
  min-height: 48px;
  border-radius: 999px;
  background-color: ${thumb};
}
html body::-webkit-scrollbar-thumb:hover,
html body *::-webkit-scrollbar-thumb:hover {
  background-color: ${thumbHover};
}
html body::-webkit-scrollbar-corner,
html body *::-webkit-scrollbar-corner {
  background: transparent;
}
`.trim();
}

function HtmlPreviewFrame({
	srcDoc,
	title,
}: {
	readonly srcDoc: string;
	readonly title: string;
}): JSX.Element {
	const [loadedSrcDoc, setLoadedSrcDoc] = useState<string | null>(null);
	const loaded = loadedSrcDoc === srcDoc;

	return (
		<div aria-busy={!loaded} className="relative min-h-0 w-full flex-1 bg-white">
			<iframe
				title={title}
				srcDoc={srcDoc}
				sandbox=""
				referrerPolicy="no-referrer"
				onLoad={() => setLoadedSrcDoc(srcDoc)}
				className={`absolute inset-0 h-full w-full border-0 bg-white ${
					loaded ? "opacity-100" : "opacity-0"
				}`}
				style={{ colorScheme: "light" }}
			/>
		</div>
	);
}

/**
 * Pure HTML render surface (iframe + srcDoc). Source editing lives in the host
 * text editor layer (edit mode) — this view has no nested preview/code chrome.
 * Does not follow app light/dark theme; the HTML document owns its look.
 */
export function HtmlPreviewView({ content, title }: HtmlPreviewViewProps): JSX.Element {
	const srcDoc = useMemo(() => createHtmlPreviewDocument(content, previewChromeStyle()), [content]);

	return (
		<div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
			{/* iframe ignores flex-grow in many engines — absolute fill matches parent height. */}
			<HtmlPreviewFrame srcDoc={srcDoc} title={title} />
		</div>
	);
}
