import { createInterface } from "node:readline";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import { spawn } from "child_process";
import { statSync } from "fs";
import path from "path";
import { ensureTool } from "../../../utils/tools-manager.js";
import { loadToolDescription } from "../description.js";
import { resolveExistingPath } from "../path-utils.js";
import { DEFAULT_MAX_BYTES, formatSize, type TruncationResult, truncateHead } from "../truncate.js";

const globSchema = Type.Object({
	pattern: Type.String({
		description: "Glob pattern to match files, e.g. '**/*.ts', 'src/**/*.spec.ts', or 'package*.json'",
	}),
	path: Type.Optional(Type.String({ description: "Directory to search in (default: current directory)" })),
	limit: Type.Optional(Type.Number({ description: "Maximum number of results (default: 100)" })),
});

export type GlobToolInput = Static<typeof globSchema>;

const DEFAULT_LIMIT = 100;

export interface GlobToolDetails {
	durationMs: number;
	numFiles: number;
	truncation?: TruncationResult;
	resultLimitReached?: number;
}

export interface GlobOperations {
	/** Check if path exists and is a directory. Throws if path doesn't exist. */
	isDirectory: (absolutePath: string) => Promise<boolean> | boolean;
	/** Find files matching glob pattern. Returns absolute or search-directory-relative paths. */
	glob: (
		pattern: string,
		cwd: string,
		options: { limit: number; signal?: AbortSignal },
	) => Promise<string[]> | string[];
}

const defaultGlobOperations: Pick<GlobOperations, "isDirectory"> = {
	isDirectory: (absolutePath) => statSync(absolutePath).isDirectory(),
};

export interface GlobToolOptions {
	/** Custom operations for glob. Default: local filesystem + ripgrep */
	operations?: GlobOperations;
}

function extractGlobBaseDirectory(patternValue: string): { baseDir: string | undefined; relativePattern: string } {
	const firstGlobChar = patternValue.search(/[*?[{]/);
	if (firstGlobChar === -1) {
		return {
			baseDir: path.dirname(patternValue),
			relativePattern: path.basename(patternValue),
		};
	}

	const staticPrefix = patternValue.slice(0, firstGlobChar);
	const lastSlash = Math.max(staticPrefix.lastIndexOf("/"), staticPrefix.lastIndexOf("\\"));
	if (lastSlash === -1) {
		return { baseDir: undefined, relativePattern: patternValue };
	}

	let baseDir = staticPrefix.slice(0, lastSlash);
	if (baseDir === "" && lastSlash === 0) {
		baseDir = path.parse(patternValue).root || path.sep;
	}
	if (process.platform === "win32" && /^[A-Za-z]:$/.test(baseDir)) {
		baseDir += path.sep;
	}

	return {
		baseDir,
		relativePattern: patternValue.slice(lastSlash + 1),
	};
}

function normalizeOutputPath(filePath: string, searchPath: string): string {
	const absolute = path.isAbsolute(filePath) ? filePath : path.join(searchPath, filePath);
	const relative = path.relative(searchPath, absolute);
	return (relative || path.basename(absolute)).replace(/\\/g, "/");
}

async function runRipgrepGlob(
	patternValue: string,
	searchPath: string,
	limit: number,
	signal?: AbortSignal,
): Promise<string[]> {
	const rgPath = await ensureTool("rg", true);
	if (!rgPath) {
		throw new Error("ripgrep (rg) is not available and could not be downloaded");
	}

	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("Operation aborted"));
			return;
		}

		const args = ["--files", "--glob", patternValue, "--sort=modified", "--hidden"];
		const child = spawn(rgPath, args, { cwd: searchPath, stdio: ["ignore", "pipe", "pipe"] });
		const rl = createInterface({ input: child.stdout });
		const results: string[] = [];
		let stderr = "";
		let settled = false;
		let aborted = false;
		let killedDueToLimit = false;

		const settle = (fn: () => void) => {
			if (!settled) {
				settled = true;
				fn();
			}
		};
		const cleanup = () => {
			rl.close();
			signal?.removeEventListener("abort", onAbort);
		};
		const onAbort = () => {
			aborted = true;
			if (!child.killed) child.kill();
		};

		signal?.addEventListener("abort", onAbort, { once: true });

		child.stderr?.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		rl.on("line", (line) => {
			if (results.length >= limit) return;
			const trimmed = line.replace(/\r$/, "").trim();
			if (!trimmed) return;
			results.push(trimmed);
			if (results.length >= limit) {
				killedDueToLimit = true;
				if (!child.killed) child.kill();
			}
		});

		child.on("error", (error) => {
			cleanup();
			settle(() => reject(new Error(`Failed to run ripgrep: ${error.message}`)));
		});

		child.on("close", (code) => {
			cleanup();
			if (aborted) {
				settle(() => reject(new Error("Operation aborted")));
				return;
			}
			if (!killedDueToLimit && code !== 0 && code !== 1) {
				settle(() => reject(new Error(stderr.trim() || `ripgrep exited with code ${code}`)));
				return;
			}
			settle(() => resolve(results));
		});
	});
}

export function createGlobTool(cwd: string, options?: GlobToolOptions): AgentTool<typeof globSchema> {
	const customOps = options?.operations;
	const fallbackDescription = `Fast file pattern matching by glob pattern. Returns matching file paths relative to the search directory. Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} results or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first).`;
	const description = loadToolDescription(import.meta.url, fallbackDescription);

	return {
		name: "glob",
		label: "glob",
		description,
		parameters: globSchema,
		execute: async (
			_toolCallId: string,
			{ pattern: patternValue, path: searchDir, limit }: { pattern: string; path?: string; limit?: number },
			signal?: AbortSignal,
		) => {
			const start = Date.now();
			let searchPath = resolveExistingPath(searchDir || ".", cwd);
			let effectivePattern = patternValue;

			if (path.isAbsolute(patternValue)) {
				const { baseDir, relativePattern } = extractGlobBaseDirectory(patternValue);
				if (baseDir) {
					searchPath = resolveExistingPath(baseDir, cwd);
					effectivePattern = relativePattern;
				}
			}

			const ops = customOps ?? defaultGlobOperations;
			let isDirectory: boolean;
			try {
				isDirectory = await ops.isDirectory(searchPath);
			} catch {
				throw new Error(`Path not found: ${searchPath}`);
			}
			if (!isDirectory) {
				throw new Error(`Not a directory: ${searchPath}`);
			}

			const effectiveLimit = Math.max(1, limit ?? DEFAULT_LIMIT);
			const rawResults = customOps
				? await customOps.glob(effectivePattern, searchPath, { limit: effectiveLimit, signal })
				: await runRipgrepGlob(effectivePattern, searchPath, effectiveLimit, signal);

			const normalized = rawResults.map((filePath) => normalizeOutputPath(filePath, searchPath));
			const uniqueResults = Array.from(new Set(normalized));
			const limitedResults = uniqueResults.slice(0, effectiveLimit);
			const resultLimitReached = uniqueResults.length >= effectiveLimit;
			const rawOutput = limitedResults.join("\n");
			const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER });
			const details: GlobToolDetails = {
				durationMs: Date.now() - start,
				numFiles: limitedResults.length,
			};

			if (limitedResults.length === 0) {
				return {
					content: [{ type: "text", text: "No files found matching pattern" }],
					details,
				};
			}

			let output = truncation.content;
			const notices: string[] = [];

			if (resultLimitReached) {
				notices.push(
					`${effectiveLimit} results limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`,
				);
				details.resultLimitReached = effectiveLimit;
			}

			if (truncation.truncated) {
				notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
				details.truncation = truncation;
			}

			if (notices.length > 0) {
				output += `\n\n[${notices.join(". ")}]`;
			}

			return {
				content: [{ type: "text", text: output }],
				details,
			};
		},
	};
}

/** Default glob tool using process.cwd() - for backwards compatibility */
export const globTool = createGlobTool(process.cwd());
