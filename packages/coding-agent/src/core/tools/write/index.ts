import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import { mkdir as fsMkdir, writeFile as fsWriteFile } from "fs/promises";
import { dirname } from "path";
import { loadToolDescription } from "../description.js";
import { resolveToCwd, resolveWritablePath, rewriteQuotedPathLiterals } from "../path-utils.js";

const writeSchema = Type.Object({
	path: Type.String({
		description: "Path to the file to write (relative/absolute), or a dir_tree path ID like @PATH_0001",
	}),
	content: Type.String({ description: "Content to write to the file" }),
});

export type WriteToolInput = Static<typeof writeSchema>;

/**
 * Pluggable operations for the write tool.
 * Override these to delegate file writing to remote systems (e.g., SSH).
 */
export interface WriteOperations {
	/** Write content to a file */
	writeFile: (absolutePath: string, content: string) => Promise<void>;
	/** Create directory (recursively) */
	mkdir: (dir: string) => Promise<void>;
}

const defaultWriteOperations: WriteOperations = {
	writeFile: (path, content) => fsWriteFile(path, content, "utf-8"),
	mkdir: (dir) => fsMkdir(dir, { recursive: true }).then(() => {}),
};

export interface WriteToolOptions {
	/** Custom operations for file writing. Default: local filesystem */
	operations?: WriteOperations;
}

export function createWriteTool(cwd: string, options?: WriteToolOptions): AgentTool<typeof writeSchema> {
	const ops = options?.operations ?? defaultWriteOperations;
	const fallbackDescription =
		"Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Automatically creates parent directories.";
	const description = loadToolDescription(import.meta.url, fallbackDescription);

	return {
		name: "write",
		label: "write",
		description,
		parameters: writeSchema,
		execute: async (
			_toolCallId: string,
			{ path, content }: { path: string; content: string },
			signal?: AbortSignal,
		) => {
			const requestedPath = resolveToCwd(path, cwd);
			const absolutePath = resolveWritablePath(path, cwd);
			const dir = dirname(absolutePath);
			const { output: correctedContent, pathCorrections } = rewriteQuotedPathLiterals(content, dir);
			const pathRetargeted = requestedPath !== absolutePath;
			const notes: string[] = [];
			if (pathRetargeted) {
				notes.push(`[Auto-corrected output path: "${path}" -> "${absolutePath}"]`);
			}
			for (const correction of pathCorrections) {
				notes.push(`[Auto-corrected path literal: "${correction.original}" -> "${correction.corrected}"]`);
			}

			return new Promise<{ content: Array<{ type: "text"; text: string }>; details: undefined }>(
				(resolve, reject) => {
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

					// Perform the write operation
					(async () => {
						try {
							// Create parent directories if needed
							await ops.mkdir(dir);

							// Check if aborted before writing
							if (aborted) {
								return;
							}

							// Write the file
							await ops.writeFile(absolutePath, correctedContent);

							// Check if aborted after writing
							if (aborted) {
								return;
							}

							// Clean up abort handler
							if (signal) {
								signal.removeEventListener("abort", onAbort);
							}

							resolve({
								content: [
									{
										type: "text",
										text:
											`${notes.join("\n")}${notes.length > 0 ? "\n" : ""}` +
											`Successfully wrote ${correctedContent.length} bytes to ${absolutePath}`,
									},
								],
								details: undefined,
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
				},
			);
		},
	};
}

/** Default write tool using process.cwd() - for backwards compatibility */
export const writeTool = createWriteTool(process.cwd());
