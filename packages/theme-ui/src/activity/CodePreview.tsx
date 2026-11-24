import { useEffect, useState, type JSX } from "react";
import { codeToHtml } from "shiki";
import { ReadonlyCodeView } from "../file-preview/ReadonlyCodeView";
import { getTextEditorLanguageId } from "../file-preview/text-editor-language";

/**
 * Shiki tokenizes the whole source on the renderer thread (about 1.4 ms per KB) and the
 * result is one unvirtualized DOM tree; past this size the preview switches to CodeMirror.
 */
export const CODE_PREVIEW_HIGHLIGHT_LIMIT = 100_000;

export interface CodePreviewProps {
	content: string;
	extension: string;
	theme: "light" | "dark";
}

export function CodePreview(props: CodePreviewProps): JSX.Element {
	if (props.content.length > CODE_PREVIEW_HIGHLIGHT_LIMIT) {
		return <ReadonlyCodeView content={props.content} extension={props.extension} />;
	}
	return <HighlightedCodePreview {...props} />;
}

function HighlightedCodePreview({ content, extension, theme }: CodePreviewProps): JSX.Element {
	const [html, setHtml] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		const lang = getTextEditorLanguageId(extension);

		codeToHtml(content, {
			lang,
			theme: theme === "dark" ? "github-dark-default" : "github-light-default",
		})
			.then((result) => {
				if (!cancelled) setHtml(result);
			})
			.catch(() => {
				if (!cancelled) setHtml("");
			});

		return () => {
			cancelled = true;
		};
	}, [content, extension, theme]);

	if (html === null) {
		return (
			<div className="flex items-center justify-center p-8">
				<span className="icon-[mdi--loading] animate-spin text-[24px] text-muted-foreground/50" />
			</div>
		);
	}

	if (html === "") {
		return (
			<pre className="text-preview-content whitespace-pre-wrap break-words p-4 font-mono text-[12px] leading-[1.6] text-foreground">
				{content}
			</pre>
		);
	}

	return (
		<div
			className="code-preview overflow-x-auto p-4 text-[12px] leading-[1.6] [&_pre]:!bg-transparent [&_code]:!bg-transparent"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: shiki generates safe HTML
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}
