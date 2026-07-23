import { type Static, Type } from "@sinclair/typebox";
import { constants } from "fs";
import { access as fsAccess, readFile as fsReadFile, writeFile as fsWriteFile } from "fs/promises";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { parseAnchor, renderAnchorRegion, validateAnchor } from "../anchors.js";
import { loadToolDescription } from "../description.js";
import {
	detectLineEnding,
	fuzzyFindText,
	generateDiffString,
	normalizeForFuzzyMatch,
	normalizeToLF,
	restoreLineEndings,
	stripBom,
} from "../edit-diff.js";
import { isKnowledgeWikiPath, isProtectedSkillOrScenePath, resolveExistingPath } from "../path-utils.js";
import { toolCallDescriptionSchema } from "../tool-call-description.js";

const anchorEditSchema = Type.Object({
	anchor: Type.String({
		description:
			'Start anchor "line:hash" copied VERBATIM from read/grep/edit output (e.g. "42:ab"). Never fabricate.',
	}),
	end_anchor: Type.Optional(
		Type.String({
			description: "Inclusive end anchor of the replaced range. Omit to target the single anchor line.",
		}),
	),
	new_text: Type.String({
		description: "Replacement for the range (may be multi-line). Empty string deletes the line(s).",
	}),
	insert_after: Type.Optional(
		Type.Boolean({
			description:
				"true = insert new_text AFTER the anchor line instead of replacing it (end_anchor must be omitted).",
		}),
	),
});

const editSchema = Type.Object({
	description: toolCallDescriptionSchema,
	path: Type.String({
		description: "Path to the file to edit (relative or absolute)",
	}),
	oldText: Type.Optional(Type.String({ description: "Exact text to find and replace (must match exactly)" })),
	newText: Type.Optional(Type.String({ description: "New text to replace the old text with" })),
	edits: Type.Optional(
		Type.Array(anchorEditSchema, {
			description:
				"Anchor-mode batch edits (preferred). Atomic: if ANY anchor is stale the whole batch is rejected and fresh anchors are returned — retry the full batch with them. Do not combine with oldText/newText.",
		}),
	),
});

export type EditToolInput = Static<typeof editSchema>;
export type AnchorEditInput = Static<typeof anchorEditSchema>;

export interface EditToolDetails {
	/** Unified diff of the changes made */
	diff: string;
	/** Line number of the first change in the new file (for editor navigation) */
	firstChangedLine?: number;
	/** Number of anchor edits applied (anchor mode only) */
	appliedEdits?: number;
}

/**
 * Pluggable operations for the edit tool.
 * Override these to delegate file editing to remote systems (e.g., SSH).
 */
export interface EditOperations {
	/** Read file contents as a Buffer */
	readFile: (absolutePath: string) => Promise<Buffer>;
	/** Write content to a file */
	writeFile: (absolutePath: string, content: string) => Promise<void>;
	/** Check if file is readable and writable (throw if not) */
	access: (absolutePath: string) => Promise<void>;
}

const defaultEditOperations: EditOperations = {
	readFile: (path) => fsReadFile(path),
	writeFile: (path, content) => fsWriteFile(path, content, "utf-8"),
	access: (path) => fsAccess(path, constants.R_OK | constants.W_OK),
};

export interface EditToolOptions {
	/** Custom operations for file editing. Default: local filesystem */
	operations?: EditOperations;
}

/** 已解析并定位到当前文件行的锚点编辑。 */
interface ResolvedAnchorEdit {
	startLine: number;
	endLine: number;
	newText: string;
	insertAfter: boolean;
	/** 输入序号（错误信息定位用） */
	index: number;
}

/**
 * 锚点批量编辑（原子）：
 * 1. 全部锚点先解析+校验（行号漂移在半径内按哈希找回；任一 stale → 整批拒绝，
 *    错误里回传各目标附近的新鲜锚点供立刻重试）；
 * 2. 范围重叠检查；
 * 3. 升序应用（行号增量补偿），一次写盘；
 * 4. 成功回执带每处修改后的新鲜锚点，模型可继续编辑无需重读。
 */
async function executeAnchorEdits(
	ops: EditOperations,
	absolutePath: string,
	displayPath: string,
	edits: AnchorEditInput[],
	signal?: AbortSignal,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: EditToolDetails }> {
	if (edits.length === 0) {
		throw new Error("edits array is empty — provide at least one anchor edit.");
	}

	try {
		await ops.access(absolutePath);
	} catch {
		throw new Error(`File not found: ${displayPath}`);
	}

	const rawContent = (await ops.readFile(absolutePath)).toString("utf-8");
	if (signal?.aborted) throw new Error("Operation aborted");

	const { bom, text: contentNoBom } = stripBom(rawContent);
	const originalEnding = detectLineEnding(contentNoBom);
	const normalized = normalizeToLF(contentNoBom);
	const lines = normalized.split("\n");

	// 1. 解析 + 校验全部锚点（原子：先全部校验，再统一应用）
	const resolved: ResolvedAnchorEdit[] = [];
	const staleReports: string[] = [];
	for (let i = 0; i < edits.length; i++) {
		const edit = edits[i];
		const startAnchor = parseAnchor(edit.anchor);
		if (!startAnchor) {
			throw new Error(
				`edits[${i}].anchor "${edit.anchor}" is malformed. Anchors look like "42:ab" and must be copied verbatim from read/grep/edit output.`,
			);
		}
		if (edit.insert_after && edit.end_anchor !== undefined) {
			throw new Error(`edits[${i}]: insert_after cannot be combined with end_anchor.`);
		}
		const startValidation = validateAnchor(lines, startAnchor);
		if (startValidation.status === "stale") {
			staleReports.push(
				`edits[${i}] anchor "${edit.anchor}" is STALE (content changed). Fresh anchors near line ${startAnchor.line}:\n${renderAnchorRegion(lines, startAnchor.line)}`,
			);
			continue;
		}
		let endLine = startValidation.line;
		if (edit.end_anchor !== undefined) {
			const endAnchor = parseAnchor(edit.end_anchor);
			if (!endAnchor) {
				throw new Error(`edits[${i}].end_anchor "${edit.end_anchor}" is malformed. Anchors look like "42:ab".`);
			}
			const endValidation = validateAnchor(lines, endAnchor);
			if (endValidation.status === "stale") {
				staleReports.push(
					`edits[${i}] end_anchor "${edit.end_anchor}" is STALE. Fresh anchors near line ${endAnchor.line}:\n${renderAnchorRegion(lines, endAnchor.line)}`,
				);
				continue;
			}
			endLine = endValidation.line;
			if (endLine < startValidation.line) {
				staleReports.push(
					`edits[${i}] range is inverted after anchor recovery (start line ${startValidation.line} > end line ${endLine}). Fresh anchors:\n${renderAnchorRegion(lines, startValidation.line)}`,
				);
				continue;
			}
		}
		resolved.push({
			startLine: startValidation.line,
			endLine,
			newText: edit.new_text,
			insertAfter: edit.insert_after === true,
			index: i,
		});
	}

	if (staleReports.length > 0) {
		throw new Error(
			`Anchor edit rejected — ${staleReports.length} of ${edits.length} anchor(s) failed; NO changes were made (edits are atomic).\n\n${staleReports.join("\n\n")}\n\nRetry the FULL batch using the fresh anchors above. Never fabricate or reuse stale anchors.`,
		);
	}

	// 2. 范围重叠检查（insert 视为宽度 0，落在锚点行之后）
	const sorted = [...resolved].sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
	for (let i = 1; i < sorted.length; i++) {
		const prev = sorted[i - 1];
		const curr = sorted[i];
		const prevEnd = prev.insertAfter ? prev.startLine : prev.endLine;
		const currStart = curr.insertAfter ? curr.startLine + 1 : curr.startLine;
		if (currStart <= prevEnd) {
			throw new Error(
				`edits[${prev.index}] and edits[${curr.index}] overlap (lines ${prev.startLine}-${prevEnd} vs ${curr.startLine}). Merge them into one edit.`,
			);
		}
	}

	// 3. 升序应用，行号增量补偿；记录每处修改在新文件中的起始行
	const newLines = [...lines];
	let delta = 0;
	const appliedAt: number[] = [];
	for (const edit of sorted) {
		const replacementLines = edit.newText === "" && !edit.insertAfter ? [] : edit.newText.split("\n");
		if (edit.insertAfter) {
			const at = edit.startLine + delta; // splice 在该行之后插入
			newLines.splice(at, 0, ...replacementLines);
			appliedAt.push(at + 1);
			delta += replacementLines.length;
		} else {
			const at = edit.startLine - 1 + delta;
			const removeCount = edit.endLine - edit.startLine + 1;
			newLines.splice(at, removeCount, ...replacementLines);
			appliedAt.push(at + 1);
			delta += replacementLines.length - removeCount;
		}
	}

	const newNormalized = newLines.join("\n");
	if (newNormalized === normalized) {
		throw new Error(`No changes made to ${displayPath}. The edits produced identical content.`);
	}
	if (signal?.aborted) throw new Error("Operation aborted");

	await ops.writeFile(absolutePath, bom + restoreLineEndings(newNormalized, originalEnding));

	// 4. 成功回执：diff 元数据 + 每处修改的新鲜锚点
	const diffResult = generateDiffString(normalized, newNormalized);
	const receiptRegions = appliedAt
		.slice(0, 8)
		.map((line) => renderAnchorRegion(newLines, line, 2))
		.join("\n---\n");
	const receipt =
		`Applied ${resolved.length} anchor edit(s) to ${displayPath}.\n\n` +
		`Fresh anchors around the changes (use these to continue editing):\n${receiptRegions}` +
		(appliedAt.length > 8 ? `\n(… ${appliedAt.length - 8} more edit site(s) omitted)` : "");

	return {
		content: [{ type: "text", text: receipt }],
		details: {
			diff: diffResult.diff,
			firstChangedLine: diffResult.firstChangedLine,
			appliedEdits: resolved.length,
		},
	};
}

export function createEditTool(cwd: string, options?: EditToolOptions): CodingAgentTool<typeof editSchema> {
	const ops = options?.operations ?? defaultEditOperations;
	const fallbackDescription =
		"Edit a file by replacing exact text. The oldText must match exactly (including whitespace). Use this for precise, surgical edits.";
	const description = loadToolDescription("edit", fallbackDescription);

	return {
		name: "edit",
		label: "edit",
		// 含 kb-processing：见 write 工具同款说明——可改解析脚本/临时文件，但写入 wiki/ 被守卫拦下。
		scope_use: ["im-claw", "conversation", "project", "batch", "automation", "kb-processing", "cli"],
		category: "core",
		description,
		parameters: editSchema,
		execute: async (_toolCallId: string, { path, oldText, newText, edits }: EditToolInput, signal?: AbortSignal) => {
			const absolutePath = resolveExistingPath(path, cwd);

			if (isProtectedSkillOrScenePath(absolutePath, cwd)) {
				throw new Error(
					`"${absolutePath}" is inside a skill/scene directory which is read-only. ` +
						`Skills and scenes are global resources — never modify them. ` +
						`Write output files to the user's working directory instead.`,
				);
			}

			if (isKnowledgeWikiPath(absolutePath)) {
				throw new Error(
					`"${absolutePath}" is inside the knowledge base wiki/ directory, which is managed exclusively by kb_write_page. ` +
						`Never hand-edit wiki pages with edit — use kb_write_page so each page keeps a validated frontmatter schema and stable id. ` +
						`Scripts and scratch files may be edited elsewhere (e.g. the working directory).`,
				);
			}

			// 模式分派：anchors 批量 vs 精确文本（互斥；anchors 优先推荐）
			if (edits !== undefined && (oldText !== undefined || newText !== undefined)) {
				throw new Error("Use either `edits` (anchor mode) or `oldText`/`newText` (exact-text mode), not both.");
			}
			if (edits !== undefined) {
				return executeAnchorEdits(ops, absolutePath, path, edits, signal);
			}
			if (oldText === undefined || newText === undefined) {
				throw new Error(
					"Missing edit payload: provide `edits` (anchor mode, preferred) or both `oldText` and `newText`.",
				);
			}

			return new Promise<{
				content: Array<{ type: "text"; text: string }>;
				details: EditToolDetails | undefined;
			}>((resolve, reject) => {
				// Check if already aborted
				if (signal?.aborted) {
					reject(new Error("Operation aborted"));
					return;
				}

				let aborted = false;

				// Set up abort handler
				const onAbort = () => {
					aborted = true;
					reject(new Error("Operation aborted"));
				};

				if (signal) {
					signal.addEventListener("abort", onAbort, { once: true });
				}

				// Perform the edit operation
				(async () => {
					try {
						// Check if file exists
						try {
							await ops.access(absolutePath);
						} catch {
							if (signal) {
								signal.removeEventListener("abort", onAbort);
							}
							reject(new Error(`File not found: ${path}`));
							return;
						}

						// Check if aborted before reading
						if (aborted) {
							return;
						}

						// Read the file
						const buffer = await ops.readFile(absolutePath);
						const rawContent = buffer.toString("utf-8");

						// Check if aborted after reading
						if (aborted) {
							return;
						}

						// Strip BOM before matching (LLM won't include invisible BOM in oldText)
						const { bom, text: content } = stripBom(rawContent);

						const originalEnding = detectLineEnding(content);
						const normalizedContent = normalizeToLF(content);
						const normalizedOldText = normalizeToLF(oldText);
						const normalizedNewText = normalizeToLF(newText);

						// Find the old text using fuzzy matching (tries exact match first, then fuzzy)
						const matchResult = fuzzyFindText(normalizedContent, normalizedOldText);

						if (!matchResult.found) {
							if (signal) {
								signal.removeEventListener("abort", onAbort);
							}
							reject(
								new Error(
									`Could not find the exact text in ${path}. The old text must match exactly including all whitespace and newlines.`,
								),
							);
							return;
						}

						// Count occurrences using fuzzy-normalized content for consistency
						const fuzzyContent = normalizeForFuzzyMatch(normalizedContent);
						const fuzzyOldText = normalizeForFuzzyMatch(normalizedOldText);
						const occurrences = fuzzyContent.split(fuzzyOldText).length - 1;

						if (occurrences > 1) {
							if (signal) {
								signal.removeEventListener("abort", onAbort);
							}
							reject(
								new Error(
									`Found ${occurrences} occurrences of the text in ${path}. The text must be unique. Please provide more context to make it unique.`,
								),
							);
							return;
						}

						// Check if aborted before writing
						if (aborted) {
							return;
						}

						// Perform replacement using the matched text position
						// When fuzzy matching was used, contentForReplacement is the normalized version
						const baseContent = matchResult.contentForReplacement;
						const newContent =
							baseContent.substring(0, matchResult.index) +
							normalizedNewText +
							baseContent.substring(matchResult.index + matchResult.matchLength);

						// Verify the replacement actually changed something
						if (baseContent === newContent) {
							if (signal) {
								signal.removeEventListener("abort", onAbort);
							}
							reject(
								new Error(
									`No changes made to ${path}. The replacement produced identical content. This might indicate an issue with special characters or the text not existing as expected.`,
								),
							);
							return;
						}

						const finalContent = bom + restoreLineEndings(newContent, originalEnding);
						await ops.writeFile(absolutePath, finalContent);

						// Check if aborted after writing
						if (aborted) {
							return;
						}

						// Clean up abort handler
						if (signal) {
							signal.removeEventListener("abort", onAbort);
						}

						const diffResult = generateDiffString(baseContent, newContent);
						resolve({
							content: [
								{
									type: "text",
									text: `Successfully replaced text in ${path}.`,
								},
							],
							details: {
								diff: diffResult.diff,
								firstChangedLine: diffResult.firstChangedLine,
							},
						});
					} catch (error: any) {
						// Clean up abort handler
						if (signal) {
							signal.removeEventListener("abort", onAbort);
						}

						if (!aborted) {
							reject(error);
						}
					}
				})();
			});
		},
	};
}

/** Default edit tool using process.cwd() - for backwards compatibility */
export const editTool = createEditTool(process.cwd());
