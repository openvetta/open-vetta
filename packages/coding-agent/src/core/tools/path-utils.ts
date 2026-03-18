import { accessSync, constants, readdirSync } from "node:fs";
import * as os from "node:os";
import { basename, dirname, isAbsolute, join, resolve as resolvePath } from "node:path";

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
const NARROW_NO_BREAK_SPACE = "\u202F";
function normalizeUnicodeSpaces(str: string): string {
	return str.replace(UNICODE_SPACES, " ");
}

function tryMacOSScreenshotPath(filePath: string): string {
	return filePath.replace(/ (AM|PM)\./g, `${NARROW_NO_BREAK_SPACE}$1.`);
}

function tryNFDVariant(filePath: string): string {
	// macOS stores filenames in NFD (decomposed) form, try converting user input to NFD
	return filePath.normalize("NFD");
}

function tryCurlyQuoteVariant(filePath: string): string {
	// macOS uses U+2019 (right single quotation mark) in screenshot names like "Capture d'écran"
	// Users typically type U+0027 (straight apostrophe)
	return filePath.replace(/'/g, "\u2019");
}

/** Strip all ASCII spaces from a string for fuzzy comparison */
function stripSpaces(s: string): string {
	return s.replace(/ /g, "");
}

/**
 * When exact filename lookup fails, scan the parent directory for a single
 * entry whose name matches after stripping spaces.  This handles the common
 * case where an LLM inserts or removes spaces in CJK / mixed-script filenames
 * (e.g. "2026-2028 年度..." vs "2026-2028年度...").
 *
 * Returns the corrected absolute path, or undefined if no unique match is found.
 */
function tryFuzzyFilenameMatch(absolutePath: string): string | undefined {
	const dir = dirname(absolutePath);
	const target = stripSpaces(basename(absolutePath)).normalize("NFC");

	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return undefined;
	}

	const matches = entries.filter((e) => stripSpaces(e).normalize("NFC") === target);
	if (matches.length === 1) {
		return join(dir, matches[0]);
	}
	return undefined;
}

function fileExists(filePath: string): boolean {
	try {
		accessSync(filePath, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

function normalizeAtPrefix(filePath: string): string {
	return filePath.startsWith("@") ? filePath.slice(1) : filePath;
}

export function expandPath(filePath: string): string {
	const normalized = normalizeUnicodeSpaces(normalizeAtPrefix(filePath));
	if (normalized === "~") {
		return os.homedir();
	}
	if (normalized.startsWith("~/")) {
		return os.homedir() + normalized.slice(1);
	}
	return normalized;
}

/**
 * Resolve a path relative to the given cwd.
 * Handles ~ expansion and absolute paths.
 */
export function resolveToCwd(filePath: string, cwd: string): string {
	const expanded = expandPath(filePath);
	if (isAbsolute(expanded)) {
		return expanded;
	}
	return resolvePath(cwd, expanded);
}

/**
 * Resolve a path that must refer to an existing file/directory.
 * Tries multiple fuzzy-matching strategies when exact lookup fails:
 *   1. macOS AM/PM narrow-space variant
 *   2. NFD (decomposed) variant
 *   3. Curly-quote variant
 *   4. NFD + curly-quote combined
 *   5. Strip-spaces fuzzy match (handles LLM-inserted spaces in CJK filenames)
 *
 * Falls back to the unmodified resolved path if nothing matches.
 */
export function resolveExistingPath(filePath: string, cwd: string): string {
	const resolved = resolveToCwd(filePath, cwd);

	if (fileExists(resolved)) {
		return resolved;
	}

	// Try macOS AM/PM variant (narrow no-break space before AM/PM)
	const amPmVariant = tryMacOSScreenshotPath(resolved);
	if (amPmVariant !== resolved && fileExists(amPmVariant)) {
		return amPmVariant;
	}

	// Try NFD variant (macOS stores filenames in NFD form)
	const nfdVariant = tryNFDVariant(resolved);
	if (nfdVariant !== resolved && fileExists(nfdVariant)) {
		return nfdVariant;
	}

	// Try curly quote variant (macOS uses U+2019 in screenshot names)
	const curlyVariant = tryCurlyQuoteVariant(resolved);
	if (curlyVariant !== resolved && fileExists(curlyVariant)) {
		return curlyVariant;
	}

	// Try combined NFD + curly quote (for French macOS screenshots like "Capture d'écran")
	const nfdCurlyVariant = tryCurlyQuoteVariant(nfdVariant);
	if (nfdCurlyVariant !== resolved && fileExists(nfdCurlyVariant)) {
		return nfdCurlyVariant;
	}

	// Fuzzy match: LLMs often insert/remove spaces in CJK filenames.
	// Search the parent directory for a file whose name matches after stripping all spaces.
	const fuzzyMatch = tryFuzzyFilenameMatch(resolved);
	if (fuzzyMatch) {
		return fuzzyMatch;
	}

	return resolved;
}

/** @deprecated Use resolveExistingPath instead */
export function resolveReadPath(filePath: string, cwd: string): string {
	return resolveExistingPath(filePath, cwd);
}
