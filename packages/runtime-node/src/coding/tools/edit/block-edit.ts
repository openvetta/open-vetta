import { lineNumberRange, renderNumberedRegion, stripLineNumberPrefixes } from "../../shared/numbered-lines.js";
import type { EditToolDetails } from "./edit-contracts.js";
import {
	detectLineEnding,
	generateDiffString,
	normalizeForFuzzyMatch,
	normalizeToLF,
	restoreLineEndings,
	stripBom,
} from "./edit-text.js";
import type { BlockEditInput } from "./schema.js";

/** Lines of context around each changed site in the success receipt. Two is enough to re-locate a
 * change with a content-matched edit; a wider window does not reduce follow-up reads. */
const RECEIPT_CONTEXT = 2;
const RECEIPT_MAX_SITES = 8;

export interface BlockEditResult {
	readonly content: string;
	readonly receipt: string;
	readonly details: EditToolDetails;
}

interface ResolvedBlock {
	/** 1-based, inclusive. */
	readonly startLine: number;
	readonly endLine: number;
	readonly newText: string;
	readonly index: number;
}

interface Match {
	readonly start: number;
	readonly end: number;
}

function compareKey(line: string): string {
	return normalizeForFuzzyMatch(line).replace(/\s+/g, " ").trim();
}

function needleLines(needle: string): string[] {
	const lines = normalizeToLF(needle).split("\n");
	while (lines.length > 0 && lines.at(-1) === "") lines.pop();
	return lines;
}

/**
 * Locations whose lines satisfy the needle: the first and last needle lines must appear inside their
 * counterpart line (so a fragment is enough and indentation does not matter), middle lines must match
 * exactly once whitespace is collapsed.
 */
function findMatches(lines: readonly string[], needle: string): Match[] {
	const parts = needleLines(needle).map(compareKey);
	const head = parts[0];
	if (head === undefined || head.length === 0) return [];

	const matches: Match[] = [];
	const span = parts.length;
	for (let start = 0; start + span - 1 < lines.length; start++) {
		const end = start + span - 1;
		if (!compareKey(lines[start]).includes(head)) continue;
		const tail = parts.at(-1) ?? head;
		if (!compareKey(lines[end]).includes(tail)) continue;
		let aligned = true;
		for (let offset = 1; offset < span - 1; offset++) {
			if (compareKey(lines[start + offset]) !== parts[offset]) {
				aligned = false;
				break;
			}
		}
		if (aligned) matches.push({ start: start + 1, end: end + 1 });
	}
	return matches;
}

function describeMatches(lines: readonly string[], matches: readonly Match[], context: number): string {
	return matches
		.slice(0, 4)
		.map((match) => renderNumberedRegion(lines, match.start, context))
		.join("\n---\n");
}

function resolveBlocks(
	lines: readonly string[],
	edits: readonly BlockEditInput[],
	displayPath: string,
): { resolved: readonly ResolvedBlock[]; strippedPrefixCount: number } {
	const resolved: ResolvedBlock[] = [];
	const failures: string[] = [];
	let strippedPrefixCount = 0;

	for (let index = 0; index < edits.length; index++) {
		const edit = edits[index];
		const headMatches = findMatches(lines, edit.oldText);
		if (headMatches.length === 0) {
			failures.push(
				`edits[${index}].oldText was not found in ${displayPath}. It must match the file's current text — copy the line you read, including its indentation or any unique part of it. Do not retype it from memory.`,
			);
			continue;
		}
		if (headMatches.length > 1) {
			failures.push(
				`edits[${index}].oldText matches ${headMatches.length} different places (lines ${headMatches
					.map((match) => match.start)
					.join(
						", ",
					)}), so it cannot identify one block. Add a neighbouring line to oldText — that extra context is what makes it unique. The candidates are:\n${describeMatches(lines, headMatches, 1)}`,
			);
			continue;
		}

		const head = headMatches[0];
		let endLine = head.end;
		if (edit.oldEndText !== undefined) {
			const tailMatches = findMatches(lines, edit.oldEndText).filter((match) => match.start >= head.start);
			if (tailMatches.length === 0) {
				failures.push(
					`edits[${index}].oldEndText was not found at or after line ${head.start}. It marks where the block ends; copy that line from the file.`,
				);
				continue;
			}
			const tail = tailMatches[0];
			endLine = tail.end;
		}

		const sanitized = stripLineNumberPrefixes(edit.newText, lineNumberRange(head.start, endLine));
		strippedPrefixCount += sanitized.strippedLines.length;
		resolved.push({ startLine: head.start, endLine, newText: sanitized.text, index });
	}

	if (failures.length > 0) {
		throw new Error(
			`Edit rejected — ${failures.length} of ${edits.length} block(s) could not be located; NO changes were made (the batch is atomic).\n\n${failures.join("\n\n")}`,
		);
	}
	return { resolved, strippedPrefixCount };
}

function validateResolvedBlocks(resolved: readonly ResolvedBlock[]): readonly ResolvedBlock[] {
	const sorted = [...resolved].sort((left, right) => left.startLine - right.startLine || left.endLine - right.endLine);
	for (let index = 1; index < sorted.length; index++) {
		const previous = sorted[index - 1];
		const current = sorted[index];
		if (current.startLine <= previous.endLine) {
			throw new Error(
				`edits[${previous.index}] and edits[${current.index}] overlap (lines ${previous.startLine}-${previous.endLine} vs ${current.startLine}-${current.endLine}). Merge them into one edit.`,
			);
		}
	}
	return sorted;
}

function formatStrippedLineNumberNotice(count: number): string {
	if (count === 0) return "";
	return (
		`\n\nNote: removed ${count} leaked line-number prefix(es) (e.g. "42:") from the replacement text. ` +
		"Line numbers locate the block; they are never part of file content."
	);
}

export function prepareBlockEdits(
	rawContent: string,
	displayPath: string,
	edits: readonly BlockEditInput[],
): BlockEditResult {
	if (edits.length === 0) throw new Error("edits array is empty — provide at least one block edit.");
	const { bom, text: contentWithoutBom } = stripBom(rawContent);
	const originalEnding = detectLineEnding(contentWithoutBom);
	const normalized = normalizeToLF(contentWithoutBom);
	const lines = normalized.split("\n");

	const { resolved, strippedPrefixCount } = resolveBlocks(lines, edits, displayPath);
	const sorted = validateResolvedBlocks(resolved);
	const newLines = [...lines];
	let delta = 0;
	const appliedAt: number[] = [];
	for (const edit of sorted) {
		const replacementLines = edit.newText === "" ? [] : edit.newText.split("\n");
		const at = edit.startLine - 1 + delta;
		const removeCount = edit.endLine - edit.startLine + 1;
		newLines.splice(at, removeCount, ...replacementLines);
		appliedAt.push(at + 1);
		delta += replacementLines.length - removeCount;
	}

	const newNormalized = newLines.join("\n");
	if (newNormalized === normalized) {
		throw new Error(
			`No changes made to ${displayPath}. The replacement is identical to the text it replaces — check that newText is the new content, not a copy of oldText.`,
		);
	}

	const diffResult = generateDiffString(normalized, newNormalized);
	const receiptRegions = appliedAt
		.slice(0, RECEIPT_MAX_SITES)
		.map((line) => renderNumberedRegion(newLines, line, RECEIPT_CONTEXT))
		.join("\n---\n");
	const receipt =
		`Applied ${resolved.length} block edit(s) to ${displayPath}.\n\n` +
		`Current lines around the changes (use these to continue editing; line numbers shift after every edit):\n${receiptRegions}` +
		(appliedAt.length > RECEIPT_MAX_SITES
			? `\n(… ${appliedAt.length - RECEIPT_MAX_SITES} more edit site(s) omitted)`
			: "") +
		formatStrippedLineNumberNotice(strippedPrefixCount);

	return {
		content: bom + restoreLineEndings(newNormalized, originalEnding),
		receipt,
		details: {
			diff: diffResult.diff,
			firstChangedLine: diffResult.firstChangedLine,
			appliedEdits: resolved.length,
		},
	};
}
