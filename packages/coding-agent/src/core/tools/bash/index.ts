import { randomBytes } from "node:crypto";
import { createWriteStream, existsSync, readdirSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type Static, Type } from "@sinclair/typebox";
import type { AgentTool } from "@vetta/agent-core";
import { spawn } from "child_process";
import { CONFIG_DIR_NAME, getAgentDir, getSceneDir } from "../../../config.js";
import {
	decodeTextBuffer,
	getDefaultShellCommandPrefix,
	getShellConfig,
	getShellEnv,
	killProcessTree,
	prependCommandPrefixes,
} from "../../../utils/shell.js";
import type { BackgroundTaskManager } from "../../background-tasks/index.js";
import { loadToolDescription } from "../description.js";
import { type PathLiteralCorrection, rewriteQuotedPathLiterals } from "../path-utils.js";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, type TruncationResult, truncateTail } from "../truncate.js";

/**
 * Generate a unique temp file path for bash output
 */
function getTempFilePath(): string {
	const id = randomBytes(8).toString("hex");
	return join(tmpdir(), `pi-bash-${id}.log`);
}

// =============================================================================
// Protected directory change detection
// =============================================================================

/** Map of file path -> mtime in ms */
type DirSnapshot = Map<string, number>;

function getProtectedDirs(cwd: string): string[] {
	return [
		resolve(join(getAgentDir(), "skills")),
		resolve(join(homedir(), CONFIG_DIR_NAME, "skills")),
		resolve(getSceneDir()),
		resolve(cwd, CONFIG_DIR_NAME, "skills"),
	].filter((dir) => existsSync(dir));
}

/** Recursively snapshot all files under a directory with their mtimes. */
function snapshotDir(dir: string): DirSnapshot {
	const snapshot: DirSnapshot = new Map();
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				for (const [k, v] of snapshotDir(fullPath)) {
					snapshot.set(k, v);
				}
			} else {
				try {
					snapshot.set(fullPath, statSync(fullPath).mtimeMs);
				} catch {
					// file may have been removed between readdir and stat
				}
			}
		}
	} catch {
		// directory not readable or doesn't exist
	}
	return snapshot;
}

function snapshotProtectedDirs(cwd: string): DirSnapshot {
	const combined: DirSnapshot = new Map();
	for (const dir of getProtectedDirs(cwd)) {
		for (const [k, v] of snapshotDir(dir)) {
			combined.set(k, v);
		}
	}
	return combined;
}

/** Compare before/after snapshots and return list of created/modified files. */
function detectProtectedChanges(before: DirSnapshot, after: DirSnapshot): string[] {
	const changed: string[] = [];
	for (const [filePath, mtime] of after) {
		const prevMtime = before.get(filePath);
		if (prevMtime === undefined || mtime > prevMtime) {
			changed.push(filePath);
		}
	}
	return changed;
}

const bashSchema = Type.Object({
	command: Type.String({
		description: "Bash command to execute.",
	}),
	timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (optional, no default timeout)" })),
	run_in_background: Type.Optional(
		Type.Boolean({
			description:
				"Run the command as a background task. Returns a task ID immediately; output is written to a log file and a <task-notification> is delivered when the command finishes. Use for long-running commands (builds, test suites, servers, watchers). Ignores timeout.",
		}),
	),
});

export type BashToolInput = Static<typeof bashSchema>;

export interface BashToolDetails {
	truncation?: TruncationResult;
	fullOutputPath?: string;
	pathCorrections?: PathLiteralCorrection[];
	/** Set when the command was started as a background task. */
	backgroundTaskId?: string;
}

/**
 * Pluggable operations for the bash tool.
 * Override these to delegate command execution to remote systems (e.g., SSH).
 */
export interface BashOperations {
	/**
	 * Execute a command and stream output.
	 * @param command - The command to execute
	 * @param cwd - Working directory
	 * @param options - Execution options
	 * @returns Promise resolving to exit code (null if killed)
	 */
	exec: (
		command: string,
		cwd: string,
		options: {
			onData: (data: Buffer) => void;
			signal?: AbortSignal;
			timeout?: number;
			env?: NodeJS.ProcessEnv;
		},
	) => Promise<{ exitCode: number | null }>;
}

/**
 * Default bash operations using local shell
 */
const defaultBashOperations: BashOperations = {
	exec: (command, cwd, { onData, signal, timeout, env }) => {
		return new Promise((resolve, reject) => {
			const { shell, args } = getShellConfig();

			if (!existsSync(cwd)) {
				reject(new Error(`Working directory does not exist: ${cwd}\nCannot execute bash commands.`));
				return;
			}

			const resolvedCommand = prependCommandPrefixes(command, [getDefaultShellCommandPrefix(shell)]);
			const child = spawn(shell, [...args, resolvedCommand], {
				cwd,
				detached: process.platform !== "win32",
				env: env ?? getShellEnv(),
				stdio: ["ignore", "pipe", "pipe"],
			});

			let timedOut = false;

			// Set timeout if provided
			let timeoutHandle: NodeJS.Timeout | undefined;
			if (timeout !== undefined && timeout > 0) {
				timeoutHandle = setTimeout(() => {
					timedOut = true;
					if (child.pid) {
						killProcessTree(child.pid);
					}
				}, timeout * 1000);
			}

			// Stream stdout and stderr
			if (child.stdout) {
				child.stdout.on("data", onData);
			}
			if (child.stderr) {
				child.stderr.on("data", onData);
			}

			// Handle shell spawn errors
			child.on("error", (err) => {
				if (timeoutHandle) clearTimeout(timeoutHandle);
				if (signal) signal.removeEventListener("abort", onAbort);
				reject(err);
			});

			// Handle abort signal - kill entire process tree
			const onAbort = () => {
				if (child.pid) {
					killProcessTree(child.pid);
				}
			};

			if (signal) {
				if (signal.aborted) {
					onAbort();
				} else {
					signal.addEventListener("abort", onAbort, { once: true });
				}
			}

			// Handle process exit
			child.on("close", (code) => {
				if (timeoutHandle) clearTimeout(timeoutHandle);
				if (signal) signal.removeEventListener("abort", onAbort);

				if (signal?.aborted) {
					reject(new Error("aborted"));
					return;
				}

				if (timedOut) {
					reject(new Error(`timeout:${timeout}`));
					return;
				}

				resolve({ exitCode: code });
			});
		});
	},
};

export interface BashSpawnContext {
	command: string;
	cwd: string;
	env: NodeJS.ProcessEnv;
}

function prependPathCorrectionNotes(text: string, corrections: PathLiteralCorrection[]): string {
	if (corrections.length === 0) return text;
	const notes = corrections.map((c) => `[Auto-corrected path: "${c.original}" -> "${c.corrected}"]`).join("\n");
	return text ? `${notes}\n${text}` : notes;
}

export type BashSpawnHook = (context: BashSpawnContext) => BashSpawnContext;

function resolveSpawnContext(command: string, cwd: string, spawnHook?: BashSpawnHook): BashSpawnContext {
	const baseContext: BashSpawnContext = {
		command,
		cwd,
		env: { ...getShellEnv() },
	};

	return spawnHook ? spawnHook(baseContext) : baseContext;
}

export interface BashToolOptions {
	/** Custom operations for command execution. Default: local shell */
	operations?: BashOperations;
	/** Command prefix prepended to every command (e.g., "shopt -s expand_aliases" for alias support) */
	commandPrefix?: string;
	/** Hook to adjust command, cwd, or env before execution */
	spawnHook?: BashSpawnHook;
	/** Background task manager enabling run_in_background (local execution only) */
	backgroundTasks?: BackgroundTaskManager;
}

export function createBashTool(cwd: string, options?: BashToolOptions): AgentTool<typeof bashSchema> {
	const ops = options?.operations ?? defaultBashOperations;
	const commandPrefix = options?.commandPrefix;
	const spawnHook = options?.spawnHook;
	const backgroundTasks = options?.backgroundTasks;
	const fallbackDescription = `Execute a bash command in the current working directory. Returns stdout and stderr. Output is truncated to last ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). If truncated, full output is saved to a temp file. Optionally provide a timeout in seconds.`;
	const description = loadToolDescription(import.meta.url, fallbackDescription);

	return {
		name: "bash",
		label: "bash",
		description,
		parameters: bashSchema,
		execute: async (
			toolCallId: string,
			{ command, timeout, run_in_background }: { command: string; timeout?: number; run_in_background?: boolean },
			signal?: AbortSignal,
			onUpdate?,
		) => {
			// Apply command prefix if configured (e.g., "shopt -s expand_aliases" for alias support)
			const resolvedCommand = prependCommandPrefixes(command, [commandPrefix]);
			const { output: correctedCommand, pathCorrections } = rewriteQuotedPathLiterals(resolvedCommand, cwd);
			const spawnContext = resolveSpawnContext(correctedCommand, cwd, spawnHook);

			if (run_in_background) {
				if (!backgroundTasks) {
					throw new Error(
						"Background execution is not available in this session. Run the command without run_in_background.",
					);
				}
				if (options?.operations) {
					throw new Error(
						"Background execution is only supported for local commands. Run the command without run_in_background.",
					);
				}
				const task = backgroundTasks.spawn({
					command: spawnContext.command,
					cwd: spawnContext.cwd,
					env: spawnContext.env,
					toolCallId,
				});
				const text = prependPathCorrectionNotes(
					`Command running in background with task ID: ${task.id}\n` +
						`Output file: ${task.outputFile}\n` +
						`A <task-notification> will be delivered when the command finishes. ` +
						`Use task_output to read incremental output, task_stop to terminate.`,
					pathCorrections,
				);
				return {
					content: [{ type: "text", text }],
					details: {
						backgroundTaskId: task.id,
						fullOutputPath: task.outputFile,
						...(pathCorrections.length > 0 ? { pathCorrections } : {}),
					} satisfies BashToolDetails,
				};
			}

			// Snapshot protected directories before execution
			const protectedSnapshot = snapshotProtectedDirs(cwd);

			return new Promise((resolve, reject) => {
				// We'll stream to a temp file if output gets large
				let tempFilePath: string | undefined;
				let tempFileStream: ReturnType<typeof createWriteStream> | undefined;
				let totalBytes = 0;

				// Keep a rolling buffer of the last chunk for tail truncation
				const chunks: Buffer[] = [];
				let chunksBytes = 0;
				// Keep more than we need so we have enough for truncation
				const maxChunksBytes = DEFAULT_MAX_BYTES * 2;

				const handleData = (data: Buffer) => {
					totalBytes += data.length;

					// Start writing to temp file once we exceed the threshold
					if (totalBytes > DEFAULT_MAX_BYTES && !tempFilePath) {
						tempFilePath = getTempFilePath();
						tempFileStream = createWriteStream(tempFilePath);
						// Write all buffered chunks to the file
						for (const chunk of chunks) {
							tempFileStream.write(chunk);
						}
					}

					// Write to temp file if we have one
					if (tempFileStream) {
						tempFileStream.write(data);
					}

					// Keep rolling buffer of recent data
					chunks.push(data);
					chunksBytes += data.length;

					// Trim old chunks if buffer is too large
					while (chunksBytes > maxChunksBytes && chunks.length > 1) {
						const removed = chunks.shift()!;
						chunksBytes -= removed.length;
					}

					// Stream partial output to callback (truncated rolling buffer)
					if (onUpdate) {
						const fullBuffer = Buffer.concat(chunks);
						const fullText = decodeTextBuffer(fullBuffer);
						const truncation = truncateTail(fullText);
						onUpdate({
							content: [{ type: "text", text: truncation.content || "" }],
							details: {
								truncation: truncation.truncated ? truncation : undefined,
								fullOutputPath: tempFilePath,
							},
						});
					}
				};

				ops.exec(spawnContext.command, spawnContext.cwd, {
					onData: handleData,
					signal,
					timeout,
					env: spawnContext.env,
				})
					.then(({ exitCode }) => {
						// Close temp file stream
						if (tempFileStream) {
							tempFileStream.end();
						}

						// Detect writes to protected skill/scene directories
						const afterSnapshot = snapshotProtectedDirs(cwd);
						const protectedChanges = detectProtectedChanges(protectedSnapshot, afterSnapshot);

						// Combine all buffered chunks
						const fullBuffer = Buffer.concat(chunks);
						const fullOutput = decodeTextBuffer(fullBuffer);

						// Apply tail truncation
						const truncation = truncateTail(fullOutput);
						let outputText = truncation.content || "(no output)";

						// Append warning if protected files were modified
						if (protectedChanges.length > 0) {
							const fileList = protectedChanges.map((f) => `  - ${f}`).join("\n");
							outputText +=
								`\n\n⚠ WARNING: The following files inside skill/scene directories were created or modified by this command:\n` +
								`${fileList}\n` +
								`Skill/scene directories are READ-ONLY. Move these output files to the user's working directory (cwd) immediately ` +
								`and delete the copies from the skill/scene directory.`;
						}

						// Build details with truncation info
						let details: BashToolDetails | undefined;
						const hasPathCorrections = pathCorrections.length > 0;

						if (truncation.truncated) {
							details = {
								truncation,
								fullOutputPath: tempFilePath,
								...(hasPathCorrections ? { pathCorrections } : {}),
							};

							// Build actionable notice
							const startLine = truncation.totalLines - truncation.outputLines + 1;
							const endLine = truncation.totalLines;

							if (truncation.lastLinePartial) {
								// Edge case: last line alone > 30KB
								const lastLineSize = formatSize(Buffer.byteLength(fullOutput.split("\n").pop() || "", "utf-8"));
								outputText += `\n\n[Showing last ${formatSize(truncation.outputBytes)} of line ${endLine} (line is ${lastLineSize}). Full output: ${tempFilePath}]`;
							} else if (truncation.truncatedBy === "lines") {
								outputText += `\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines}. Full output: ${tempFilePath}]`;
							} else {
								outputText += `\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Full output: ${tempFilePath}]`;
							}
						}
						if (!details && hasPathCorrections) {
							details = { pathCorrections };
						}
						outputText = prependPathCorrectionNotes(outputText, pathCorrections);

						if (exitCode !== 0 && exitCode !== null) {
							outputText += `\n\nCommand exited with code ${exitCode}`;
							reject(new Error(outputText));
						} else {
							resolve({ content: [{ type: "text", text: outputText }], details });
						}
					})
					.catch((err: Error) => {
						// Close temp file stream
						if (tempFileStream) {
							tempFileStream.end();
						}

						// Combine all buffered chunks for error output
						const fullBuffer = Buffer.concat(chunks);
						let output = decodeTextBuffer(fullBuffer);
						output = prependPathCorrectionNotes(output, pathCorrections);

						if (err.message === "aborted") {
							if (output) output += "\n\n";
							output += "Command aborted";
							reject(new Error(output));
						} else if (err.message.startsWith("timeout:")) {
							const timeoutSecs = err.message.split(":")[1];
							if (output) output += "\n\n";
							output += `Command timed out after ${timeoutSecs} seconds`;
							reject(new Error(output));
						} else {
							reject(err);
						}
					});
			});
		},
	};
}

/** Default bash tool using process.cwd() - for backwards compatibility */
export const bashTool = createBashTool(process.cwd());
