import { constants } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import { resolveExistingPath } from "../../shared/path-resolution.js";
import { prepareBlockEdits } from "./block-edit.js";
import { EDIT_TOOL_DESCRIPTION } from "./description.js";
import type { EditOperations, EditToolDetails, EditToolOptions } from "./edit-contracts.js";
import { generateDiffString, prepareExactTextEdit } from "./edit-text.js";
import { type EditToolInput, EditToolInputSchema } from "./schema.js";
import { detectStructuralRegression, hasJsx, isStructuredSource } from "./structural.js";

const defaultEditOperations: EditOperations = {
	readFile: (path) => readFile(path),
	writeFile: (path, content) => writeFile(path, content, "utf-8"),
	access: (path) => access(path, constants.R_OK | constants.W_OK),
};

interface EditToolResult {
	readonly content: readonly [{ readonly type: "text"; readonly text: string }];
	readonly details: EditToolDetails;
}

/**
 * Refuse an edit that leaves the file more structurally broken than it was. Runs on the whole file,
 * before anything is written, so a rejected batch leaves the file untouched.
 */
function assertNoStructuralRegression(before: string, after: string, displayPath: string): void {
	if (!isStructuredSource(displayPath)) return;
	const regression = detectStructuralRegression(before, after, { jsx: hasJsx(displayPath) });
	if (regression === undefined) return;
	throw new Error(
		`Edit rejected — it would leave ${displayPath} structurally broken (${regression.issue.message}); NO changes were made.\n\n` +
			"The text you replaced lost part of the structure it opened or closed. Common causes: the block ended with a closing `}`, `)`, `]` or `</Tag>` that the replacement no longer contains, or the replacement stops mid-element.\n\n" +
			"Fix the replacement so what it opens is also closed. For a block this size, `write` for the whole file or a short `bash` + python3 script is often the safer call.",
	);
}

async function executeBlockMode(
	operations: EditOperations,
	absolutePath: string,
	displayPath: string,
	edits: NonNullable<EditToolInput["edits"]>,
	signal: AbortSignal,
): Promise<EditToolResult> {
	if (edits.length === 0) throw new Error("edits array is empty — provide at least one block edit.");
	try {
		await operations.access(absolutePath);
	} catch {
		throw new Error(`File not found: ${displayPath}`);
	}
	const rawContent = (await operations.readFile(absolutePath)).toString("utf-8");
	if (signal.aborted) throw new Error("Operation aborted");
	const edit = prepareBlockEdits(rawContent, displayPath, edits);
	assertNoStructuralRegression(rawContent, edit.content, displayPath);
	if (signal.aborted) throw new Error("Operation aborted");
	await operations.writeFile(absolutePath, edit.content);
	return {
		content: [{ type: "text", text: edit.receipt }],
		details: edit.details,
	};
}

function executeExactTextMode(
	operations: EditOperations,
	absolutePath: string,
	displayPath: string,
	oldText: string,
	newText: string,
	signal: AbortSignal,
): Promise<EditToolResult> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(new Error("Operation aborted"));
			return;
		}

		let aborted = false;
		const onAbort = (): void => {
			aborted = true;
			reject(new Error("Operation aborted"));
		};
		signal.addEventListener("abort", onAbort, { once: true });

		void (async () => {
			try {
				try {
					await operations.access(absolutePath);
				} catch {
					signal.removeEventListener("abort", onAbort);
					reject(new Error(`File not found: ${displayPath}`));
					return;
				}
				if (aborted) return;
				const rawContent = (await operations.readFile(absolutePath)).toString("utf-8");
				if (aborted) return;
				const edit = prepareExactTextEdit(rawContent, oldText, newText, displayPath);
				assertNoStructuralRegression(rawContent, edit.content, displayPath);
				if (aborted) return;
				await operations.writeFile(absolutePath, edit.content);
				if (aborted) return;
				signal.removeEventListener("abort", onAbort);
				const diff = generateDiffString(edit.baseContent, edit.newContent);
				resolve({
					content: [
						{
							type: "text",
							text:
								`Successfully replaced text in ${displayPath}.` +
								(edit.strippedPrefixCount > 0
									? `\n\nNote: removed ${edit.strippedPrefixCount} leaked line-number prefix(es) from the replacement text.`
									: ""),
						},
					],
					details: { diff: diff.diff, firstChangedLine: diff.firstChangedLine },
				});
			} catch (error: unknown) {
				signal.removeEventListener("abort", onAbort);
				if (!aborted) reject(error);
			}
		})();
	});
}

export function createEditTool(cwd: string, options: EditToolOptions): RuntimeToolDefinition<EditToolInput> {
	const operations = options.operations ?? defaultEditOperations;
	const pathPolicy = options.pathPolicy;
	return {
		name: "edit",
		label: "edit",
		description: EDIT_TOOL_DESCRIPTION,
		inputSchema: EditToolInputSchema,
		async execute(request) {
			const { path, oldText, newText, edits } = request.input;
			const absolutePath = resolveExistingPath(path, cwd, options.pathHost);
			const rejectionReason = pathPolicy.getRejectionReason(absolutePath);
			if (rejectionReason !== undefined) throw new Error(rejectionReason);
			if (edits !== undefined && (oldText !== undefined || newText !== undefined)) {
				throw new Error("Use either `edits` (block mode) or `oldText`/`newText` (exact-text mode), not both.");
			}
			if (edits !== undefined) {
				return executeBlockMode(operations, absolutePath, path, edits, request.signal);
			}
			if (oldText === undefined || newText === undefined) {
				throw new Error(
					"Missing edit payload: provide `edits` (block mode, preferred) or both `oldText` and `newText`.",
				);
			}
			return executeExactTextMode(operations, absolutePath, path, oldText, newText, request.signal);
		},
	};
}
