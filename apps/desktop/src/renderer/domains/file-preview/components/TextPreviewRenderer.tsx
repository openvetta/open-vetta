import { resolvedThemeAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { CodePreview } from "../../activity-panel/components/previews/CodePreview";
import { HtmlPreview } from "../../activity-panel/components/previews/HtmlPreview";
import { MarkdownPreview } from "../../activity-panel/components/previews/MarkdownPreview";

const MARKDOWN_EXTENSIONS = new Set(["md", "mdx", "markdown"]);
const HTML_EXTENSIONS = new Set(["html", "htm", "xhtml"]);
const SCROLL_WRAP = "text-preview-content min-h-0 flex-1 overflow-y-auto";

/**
 * Markdown and HTML are parsed and laid out whole on the renderer thread. Past this size a
 * preview nobody explicitly asked for shows the source, which is virtualized, instead.
 */
export const RENDERED_PREVIEW_SIZE_LIMIT = 200_000;

export function isRenderedPreviewExtension(extension: string): boolean {
	return MARKDOWN_EXTENSIONS.has(extension) || HTML_EXTENSIONS.has(extension);
}

export function TextPreviewRenderer({
	content,
	extension,
	sourcePath,
	renderLargeDocuments = false,
}: {
	content: string;
	extension: string;
	sourcePath?: string;
	/** The user picked the rendered view themselves, so render it whatever the size. */
	renderLargeDocuments?: boolean;
}): JSX.Element {
	const theme = useAtomValue(resolvedThemeAtom);
	const rendered = renderLargeDocuments || content.length <= RENDERED_PREVIEW_SIZE_LIMIT;
	const displayContent = useMemo(() => {
		if (extension !== "json") return content;
		try {
			return JSON.stringify(JSON.parse(content), null, 2);
		} catch {
			// Keep invalid JSON editable and show it unchanged.
			return content;
		}
	}, [content, extension]);
	if (rendered && HTML_EXTENSIONS.has(extension)) {
		return <HtmlPreview content={content} theme={theme} />;
	}
	if (rendered && MARKDOWN_EXTENSIONS.has(extension)) {
		return (
			<div className={SCROLL_WRAP}>
				<MarkdownPreview content={content} sourcePath={sourcePath} />
			</div>
		);
	}
	return (
		<div className={SCROLL_WRAP}>
			<CodePreview content={displayContent} extension={extension} theme={theme} />
		</div>
	);
}
