/**
 * Line numbering for read/grep output.
 *
 * Output lines are `42:content`. The number is the only addressing a model needs, and unlike a
 * content hash it is unique by construction — a file with forty blank lines still has one line 42.
 * Identity comes from the content the model quotes back, freshness from the number; see
 * docs/adr/0157-edit-content-anchored-locating.md.
 */

/** Prefix each line with its 1-based file line number. */
export function renderNumberedLines(lines: readonly string[], startLine: number): string[] {
	return lines.map((line, index) => `${startLine + index}:${line}`);
}

/** A window of `context` lines either side of `centerLine`, each line numbered. */
export function renderNumberedRegion(lines: readonly string[], centerLine: number, context = 2): string {
	const start = Math.max(1, centerLine - context);
	const end = Math.min(lines.length, centerLine + context);
	if (end < start) return "(file is empty)";
	return renderNumberedLines(lines.slice(start - 1, end), start).join("\n");
}

const LINE_NUMBER_PREFIX = /^(\d{1,9}):/;

export interface LineNumberStripResult {
	readonly text: string;
	readonly strippedLines: readonly number[];
}

/**
 * Remove leaked `N:` prefixes that a model copied out of read/grep output into replacement text.
 *
 * Only numbers the model was actually shown for the block it is replacing are stripped, so genuine
 * content that happens to begin with `12:` survives untouched.
 */
export function stripLineNumberPrefixes(text: string, knownLineNumbers: ReadonlySet<number>): LineNumberStripResult {
	const lines = text.split("\n");
	const strippedLines: number[] = [];
	const output = lines.map((line, index) => {
		const match = LINE_NUMBER_PREFIX.exec(line);
		if (!match) return line;
		if (!knownLineNumbers.has(Number.parseInt(match[1], 10))) return line;
		strippedLines.push(index + 1);
		return line.slice(match[0].length);
	});
	if (strippedLines.length === 0) return { text, strippedLines };
	return { text: output.join("\n"), strippedLines };
}

/** Consecutive 1-based line numbers covering an inclusive range. */
export function lineNumberRange(startLine: number, endLine: number): Set<number> {
	const numbers = new Set<number>();
	for (let line = startLine; line <= endLine; line++) numbers.add(line);
	return numbers;
}
