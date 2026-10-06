/** Bound preview parsing without truncating the source stored in history. */
export const MAX_HTML_PREVIEW_LENGTH = 512 * 1024;

export function isHtmlPreviewLanguage(language: string): boolean {
	return /^(html|html-preview)$/i.test(language);
}

/** Markdown accepts unclosed fences; preview readiness must use source syntax. */
export function isClosedHtmlFence(
	text: string,
	position?: { start: { offset?: number }; end: { offset?: number } },
	parsedCode?: string,
): boolean {
	const start = position?.start.offset;
	const end = position?.end.offset;
	if (start === undefined || end === undefined) return false;
	const lines = text.slice(start, end).replace(/\r\n?/g, "\n").split("\n");
	const opening = /^ {0,3}(`{3,}|~{3,})[ \t]*(?:html|html-preview)(?:[ \t].*)?$/i.exec(lines[0] ?? "");
	if (!opening || lines.length < 2) return false;
	const marker = opening[1];
	// The Markdown parser removes container prefixes and a real closing line,
	// but keeps an apparent closer that is actually code (for example "> ```"
	// inside an unclosed top-level fence). Comparing line counts lets the parser
	// own list/blockquote indentation rather than duplicating CommonMark here.
	if (parsedCode !== undefined) {
		const code = parsedCode.replace(/\r\n?/g, "\n");
		const expectedLines = code.split("\n").length + 2;
		if (lines.length !== expectedLines && !(code === "" && lines.length === 2)) return false;
	}
	const closing = (parsedCode === undefined ? /^ {0,3}(`{3,}|~{3,})[ \t]*$/ : /^[ \t>]*(`{3,}|~{3,})[ \t]*$/).exec(
		lines.at(-1) ?? "",
	);
	return !!closing && closing[1][0] === marker[0] && closing[1].length >= marker.length;
}
