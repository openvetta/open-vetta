/**
 * Whole-file structural regression detection.
 *
 * The rule is comparative, never absolute: reject only when the edit leaves the file *more* broken
 * than it found it. A file that already has unbalanced braces somewhere can still be edited; an edit
 * that makes the imbalance worse is refused before it is written.
 *
 * This is a lexer-level check (comment/string/regex aware, JSX tag names matched), not a parser.
 * A real parser would need a per-language dependency; see
 * docs/adr/0157-edit-content-anchored-locating.md for why that was left out.
 */

const CODE_EXTENSIONS = new Set([
	"c",
	"cc",
	"cpp",
	"cs",
	"cts",
	"go",
	"h",
	"hpp",
	"java",
	"js",
	"json",
	"jsonc",
	"jsx",
	"kt",
	"kts",
	"mjs",
	"mts",
	"py",
	"rs",
	"swift",
	"ts",
	"tsx",
]);

const JSX_EXTENSIONS = new Set(["jsx", "tsx"]);

/** Whether this file type has structure worth checking. Prose is skipped on purpose: unbalanced
 * braces in a document are normal, and a "regression" there would be a false rejection. */
export function isStructuredSource(path: string): boolean {
	const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	return CODE_EXTENSIONS.has(extension);
}

export function hasJsx(path: string): boolean {
	const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	return JSX_EXTENSIONS.has(extension);
}

export type StructureKind = "brace" | "bracket" | "paren" | "jsx";

export interface StructureIssue {
	readonly kind: StructureKind;
	readonly line: number;
	readonly message: string;
}

export interface StructureSnapshot {
	/** Openers left without a closer. */
	readonly unclosed: Readonly<Record<StructureKind, number>>;
	/** Closers that closed nothing. Both directions are breakage, so both are compared. */
	readonly stray: Readonly<Record<StructureKind, number>>;
	readonly issues: readonly StructureIssue[];
}

/** Replace comments, strings and regex literals with spaces, preserving every offset and newline so
 * a position in the mask maps to the same position in the source. */
function maskNonCode(text: string): string {
	const masked = text.replace(
		/(?:\/(?![*/])(?:\\.|[^/\\\n])+\/[dgimsuvy]*)|(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*)|(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g,
		(match) => match.replace(/[^\n]/g, " "),
	);
	return masked;
}

function lineStarts(text: string): number[] {
	const starts = [0];
	for (let index = 0; index < text.length; index++) {
		if (text[index] === "\n") starts.push(index + 1);
	}
	return starts;
}

function lineAt(starts: readonly number[], index: number): number {
	let low = 0;
	let high = starts.length - 1;
	while (low < high) {
		const mid = (low + high + 1) >> 1;
		if (starts[mid] <= index) low = mid;
		else high = mid - 1;
	}
	return low + 1;
}

const CLOSER_OF: Record<string, StructureKind> = { "}": "brace", "]": "bracket", ")": "paren" };
const OPENER_OF: Record<string, StructureKind> = { "{": "brace", "[": "bracket", "(": "paren" };
const OPENER_TEXT: Record<StructureKind, string> = { brace: "{", bracket: "[", paren: "(", jsx: "<" };

interface OpenEntry {
	readonly kind: StructureKind;
	readonly line: number;
	readonly name?: string;
}

/** A `<` begins JSX only when it is not a generic argument list. `Foo<Bar>` and `useState<T>` are
 * preceded by an identifier, while `return <div>` is preceded by a keyword. */
function startsJsx(masked: string, index: number): boolean {
	let cursor = index - 1;
	while (cursor >= 0 && /\s/.test(masked[cursor])) cursor--;
	if (cursor < 0) return true;
	const previous = masked[cursor];
	if (!/[A-Za-z0-9_$]/.test(previous)) return true;
	let wordStart = cursor;
	while (wordStart >= 0 && /[A-Za-z0-9_$]/.test(masked[wordStart])) wordStart--;
	const word = masked.slice(wordStart + 1, cursor + 1);
	return /^(?:return|yield|await|case|default|else|do|in|of)$/.test(word);
}

function analyzeJsx(
	masked: string,
	starts: readonly number[],
	issues: StructureIssue[],
	unclosed: Record<StructureKind, number>,
	stray: Record<StructureKind, number>,
): void {
	const stack: string[] = [];
	const tagPattern = /<(\/)?([A-Za-z][\w.:-]*)(?:\s[^<>]*?)?(\/?)>|<>|<\/>/g;
	for (const match of masked.matchAll(tagPattern)) {
		const [full, closing, name, selfClosing] = match;
		const index = match.index ?? 0;
		if (full === "<>" || full === "</>") {
			if (full === "</>") {
				if (stack.length === 0) {
					stray.jsx += 1;
					issues.push({ kind: "jsx", line: lineAt(starts, index), message: "`</>` closes nothing" });
				} else {
					stack.pop();
				}
			} else {
				stack.push("<>");
			}
			continue;
		}
		// Only openers can be confused with a generic argument list; a closer is always JSX.
		if (selfClosing) continue;
		if (closing) {
			const open = stack.pop();
			if (open !== name) {
				stray.jsx += 1;
				issues.push({
					kind: "jsx",
					line: lineAt(starts, index),
					message: `\`</${name}>\` closes \`<${open ?? "nothing"}>\``,
				});
				// Re-open nothing: the stack is already popped, so the file keeps being analysed
				// from a best-effort position rather than cascading one mismatch into many.
			}
			continue;
		}
		if (!startsJsx(masked, index)) continue;
		stack.push(name);
	}
	if (stack.length > 0) {
		unclosed.jsx += stack.length;
		issues.push({
			kind: "jsx",
			line: 0,
			message: `\`<${stack.at(-1)}>\` is never closed`,
		});
	}
}

/**
 * Snapshot the file's delimiter balance. Unclosed counts are what the regression rule compares;
 * `issues` only describes the first few problems for the model-facing error.
 */
export function analyzeStructure(text: string, options: { jsx: boolean }): StructureSnapshot {
	const masked = maskNonCode(text);
	const starts = lineStarts(text);
	const open: OpenEntry[] = [];
	const unclosed: Record<StructureKind, number> = { brace: 0, bracket: 0, paren: 0, jsx: 0 };
	const stray: Record<StructureKind, number> = { brace: 0, bracket: 0, paren: 0, jsx: 0 };
	const issues: StructureIssue[] = [];

	for (let index = 0; index < masked.length; index++) {
		const character = masked[index];
		const openerKind = OPENER_OF[character];
		if (openerKind !== undefined) {
			open.push({ kind: openerKind, line: lineAt(starts, index) });
			continue;
		}
		const closerKind = CLOSER_OF[character];
		if (closerKind === undefined) continue;
		// Find the nearest opener of the same kind; anything opened after it is unclosed.
		let matchIndex = -1;
		for (let cursor = open.length - 1; cursor >= 0; cursor--) {
			if (open[cursor].kind === closerKind) {
				matchIndex = cursor;
				break;
			}
		}
		if (matchIndex === -1) {
			stray[closerKind] += 1;
			issues.push({
				kind: closerKind,
				line: lineAt(starts, index),
				message: `\`${character}\` closes nothing`,
			});
			continue;
		}
		open.length = matchIndex;
	}

	for (const entry of open) unclosed[entry.kind] += 1;
	if (open.length > 0) {
		// Describe the innermost unclosed delimiter: that is the one an author most likely broke.
		const last = open.at(-1);
		if (last) {
			issues.push({
				kind: last.kind,
				line: last.line,
				message: `\`${OPENER_TEXT[last.kind]}\` opened at line ${last.line} is never closed`,
			});
		}
	}

	if (options.jsx) {
		analyzeJsx(masked, starts, issues, unclosed, stray);
	}

	return { unclosed, stray, issues };
}

/**
 * The edit's structural effect, or `undefined` when it does not make things worse.
 * Only the first issue is returned; the caller turns it into a model-facing message.
 */
export function detectStructuralRegression(
	before: string,
	after: string,
	options: { jsx: boolean },
): { issue: StructureIssue; kind: StructureKind } | undefined {
	const beforeSnapshot = analyzeStructure(before, options);
	const afterSnapshot = analyzeStructure(after, options);
	for (const kind of ["jsx", "brace", "bracket", "paren"] as const) {
		const worse =
			afterSnapshot.unclosed[kind] > beforeSnapshot.unclosed[kind] ||
			afterSnapshot.stray[kind] > beforeSnapshot.stray[kind];
		if (!worse) continue;
		const issue =
			afterSnapshot.issues.find((candidate) => candidate.kind === kind) ??
			({ kind, line: 0, message: `one more unclosed \`${OPENER_TEXT[kind]}\`` } as StructureIssue);
		return { issue, kind };
	}
	return undefined;
}
