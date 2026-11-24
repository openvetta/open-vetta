/** Below this size a document renders in one pass; above it, section by section. */
export const PROGRESSIVE_MARKDOWN_THRESHOLD = 40_000;
/** Each chunk takes roughly a frame or two to parse and render. */
const TARGET_CHUNK_CHARACTERS = 12_000;

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const ATX_HEADING_RE = /^ {0,3}#{1,6}(\s|$)/;
const FOOTNOTE_DEFINITION_RE = /^ {0,3}\[\^[^\]]+\]:/m;
const LINK_DEFINITION_RE = /^ {0,3}\[[^\]^][^\]]*\]:\s*\S/;

/**
 * Splits a large Markdown document into independently renderable chunks, cutting only
 * before an ATX heading that follows a blank line outside fenced code. A heading always
 * starts a new block, so no list, quote, table or paragraph spans two chunks.
 *
 * Link reference definitions apply document-wide, so they are repeated at the end of every
 * chunk (they render nothing). Footnotes collect into one section per render, so a document
 * that defines any is never split.
 */
export function splitMarkdownForProgressiveRender(markdown: string): string[] {
	if (markdown.length <= PROGRESSIVE_MARKDOWN_THRESHOLD || FOOTNOTE_DEFINITION_RE.test(markdown)) {
		return [markdown];
	}
	const lines = markdown.split("\n");
	const chunks: string[] = [];
	const definitions: string[] = [];
	let current: string[] = [];
	let currentLength = 0;
	let fence: string | null = null;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? "";
		const fenceMatch = FENCE_RE.exec(line);
		if (fence === null) {
			if (fenceMatch?.[1]) {
				fence = fenceMatch[1];
			} else if (
				ATX_HEADING_RE.test(line) &&
				index > 0 &&
				(lines[index - 1] ?? "").trim() === "" &&
				currentLength >= TARGET_CHUNK_CHARACTERS
			) {
				chunks.push(current.join("\n"));
				current = [];
				currentLength = 0;
			} else if (LINK_DEFINITION_RE.test(line)) {
				definitions.push(line);
			}
		} else if (fenceMatch?.[1] && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
			fence = null;
		}
		current.push(line);
		currentLength += line.length + 1;
	}
	if (current.length > 0) chunks.push(current.join("\n"));
	if (definitions.length === 0 || chunks.length === 1) return chunks;
	const shared = `\n\n${definitions.join("\n")}\n`;
	return chunks.map((chunk) => `${chunk}${shared}`);
}
