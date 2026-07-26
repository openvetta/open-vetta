import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCodingAgentForegroundCommandHost } from "@vetta/coding-agent/host";
import { describe, expect, it } from "vitest";
import {
	type BashOperations,
	type BashToolOptions,
	createBashTool as createLegacyBashTool,
} from "../../../../coding-agent/src/core/tools/bash/index.js";
import { createShellTool as createLegacyShellTool } from "../../../../coding-agent/src/core/tools/shell/index.js";
import {
	type CommandToolExecutor,
	createBashToolRegistration,
	createForegroundCommandToolExecutor,
	createShellToolRegistration,
	getBashToolScopes,
	getShellToolScopes,
} from "../../../src/coding/index.js";

type CommandName = "bash" | "shell";

function createOperations(output: string, exitCode = 0): BashOperations {
	return {
		async exec(_command, _cwd, options) {
			options.onData(Buffer.from(output));
			return { exitCode };
		},
	};
}

function createLegacyTool(name: CommandName, cwd: string, options: BashToolOptions) {
	return name === "bash" ? createLegacyBashTool(cwd, options) : createLegacyShellTool(cwd, options);
}

function createRuntimeRegistration(name: CommandName, cwd: string, toolOptions: BashToolOptions) {
	const host = createCodingAgentForegroundCommandHost(cwd);
	const executor = createForegroundCommandToolExecutor({
		...host,
		operations: toolOptions.operations ?? host.operations,
		commandPrefix: toolOptions.commandPrefix,
		spawnHook: toolOptions.spawnHook ? (context) => toolOptions.spawnHook?.({ ...context }) ?? context : undefined,
		blockUntilSec: toolOptions.blockUntilSec,
	});
	return name === "bash"
		? createBashToolRegistration(cwd, { executor })
		: createShellToolRegistration(cwd, { executor });
}

describe.each(["bash", "shell"] as const)("runtime %s command adapter", (toolName) => {
	it("preserves the legacy definition, scope, output, details, and updates", async () => {
		const cwd = "C:/workspace";
		const calls: Array<{ readonly command: string; readonly cwd: string; readonly marker?: string }> = [];
		const toolOptions: BashToolOptions = {
			operations: {
				async exec(command, operationCwd, options) {
					calls.push({ command, cwd: operationCwd, marker: options.env?.COMMAND_CONTRACT_MARKER });
					options.onData(Buffer.from("command output\n"));
					return { exitCode: 0 };
				},
			},
			commandPrefix: "echo prefix",
			spawnHook: (context) => ({
				...context,
				command: `${context.command}\necho hook`,
				cwd: "C:/spawn-cwd",
				env: { ...context.env, COMMAND_CONTRACT_MARKER: "present" },
			}),
		};
		const legacy = createLegacyTool(toolName, cwd, toolOptions);
		const runtime = createRuntimeRegistration(toolName, cwd, toolOptions);

		expect({
			name: runtime.tool.name,
			label: runtime.tool.label,
			description: runtime.tool.description,
			schema: runtime.tool.inputSchema,
			scopeUse: runtime.scopeUse,
			category: runtime.category,
		}).toEqual({
			name: legacy.name,
			label: legacy.label,
			description: legacy.description,
			schema: legacy.parameters,
			scopeUse: legacy.scope_use,
			category: legacy.category,
		});

		const input = { command: "echo command", timeout: 7 };
		const legacyUpdates: unknown[] = [];
		const runtimeUpdates: unknown[] = [];
		const legacyResult = await legacy.execute("legacy-call", input, undefined, (update) => {
			legacyUpdates.push(update);
		});
		const runtimeResult = await runtime.tool.execute({
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "runtime-call",
			input,
			signal: new AbortController().signal,
			onUpdate: (update) => runtimeUpdates.push(update),
		});

		expect(runtimeResult).toEqual(legacyResult);
		expect(runtimeUpdates).toEqual(legacyUpdates);
		expect(calls).toEqual([
			{ command: "echo prefix\necho command\necho hook", cwd: "C:/spawn-cwd", marker: "present" },
			{ command: "echo prefix\necho command\necho hook", cwd: "C:/spawn-cwd", marker: "present" },
		]);
	});

	it("preserves protected skill directory warnings", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "runtime-command-protected-"));
		const protectedDirectory = join(cwd, ".vetta", "skills");
		const protectedFile = join(protectedDirectory, "changed.txt");
		mkdirSync(protectedDirectory, { recursive: true });
		const toolOptions: BashToolOptions = {
			operations: {
				async exec(_command, _cwd, options) {
					writeFileSync(protectedFile, "changed");
					options.onData(Buffer.from("done"));
					return { exitCode: 0 };
				},
			},
		};

		try {
			const legacy = createLegacyTool(toolName, cwd, toolOptions);
			const legacyResult = await legacy.execute("legacy-protected", { command: "write-protected" });
			rmSync(protectedFile);
			const runtime = createRuntimeRegistration(toolName, cwd, toolOptions);
			const runtimeResult = await runtime.tool.execute({
				sessionId: "session-1",
				turnId: "turn-1",
				toolCallId: "runtime-protected",
				input: { command: "write-protected" },
				signal: new AbortController().signal,
			});
			expect(runtimeResult).toEqual(legacyResult);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("preserves non-zero exit and unavailable background errors", async () => {
		const cwd = "C:/workspace";
		const failingOptions: BashToolOptions = { operations: createOperations("failure output", 2) };
		const legacy = createLegacyTool(toolName, cwd, failingOptions);
		const runtime = createRuntimeRegistration(toolName, cwd, failingOptions);
		const signal = new AbortController().signal;

		await expect(legacy.execute("legacy-failure", { command: "fail" })).rejects.toThrow(
			"failure output\n\nCommand exited with code 2",
		);
		await expect(
			runtime.tool.execute({
				sessionId: "session-1",
				turnId: "turn-1",
				toolCallId: "runtime-failure",
				input: { command: "fail" },
				signal,
			}),
		).rejects.toThrow("failure output\n\nCommand exited with code 2");
		await expect(legacy.execute("legacy-background", { command: "serve", run_in_background: true })).rejects.toThrow(
			"Background execution is not available in this session",
		);
		await expect(
			runtime.tool.execute({
				sessionId: "session-1",
				turnId: "turn-1",
				toolCallId: "runtime-background",
				input: { command: "serve", run_in_background: true },
				signal,
			}),
		).rejects.toThrow("Background execution is not available in this session");
	});

	it("preserves timeout, abort, path correction, and line truncation behavior", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "runtime-command-contract-"));
		try {
			writeFileSync(join(cwd, "报告-最终.txt"), "content");
			const capturedCommands: string[] = [];
			const pathOptions: BashToolOptions = {
				operations: {
					async exec(command, _cwd, options) {
						capturedCommands.push(command);
						options.onData(Buffer.from("corrected"));
						return { exitCode: 0 };
					},
				},
			};
			const legacyPath = createLegacyTool(toolName, cwd, pathOptions);
			const runtimePath = createRuntimeRegistration(toolName, cwd, pathOptions);
			const input = { command: 'read "报告 - 最终.txt"' };
			const legacyResult = await legacyPath.execute("legacy-path", input);
			const runtimeResult = await runtimePath.tool.execute({
				sessionId: "session-1",
				turnId: "turn-1",
				toolCallId: "runtime-path",
				input,
				signal: new AbortController().signal,
			});
			expect(runtimeResult).toEqual(legacyResult);
			expect(capturedCommands).toEqual(['read "报告-最终.txt"', 'read "报告-最终.txt"']);

			const largeOutput = Array.from({ length: 2_002 }, (_, index) => `line-${index}`).join("\n");
			const truncationOptions: BashToolOptions = { operations: createOperations(largeOutput) };
			const legacyTruncation = createLegacyTool(toolName, cwd, truncationOptions);
			const runtimeTruncation = createRuntimeRegistration(toolName, cwd, truncationOptions);
			const legacyTruncated = await legacyTruncation.execute("legacy-truncation", { command: "many-lines" });
			const runtimeTruncated = await runtimeTruncation.tool.execute({
				sessionId: "session-1",
				turnId: "turn-1",
				toolCallId: "runtime-truncation",
				input: { command: "many-lines" },
				signal: new AbortController().signal,
			});
			expect(runtimeTruncated).toEqual(legacyTruncated);

			for (const errorMessage of ["timeout:3", "aborted"]) {
				const errorOptions: BashToolOptions = {
					operations: {
						async exec() {
							throw new Error(errorMessage);
						},
					},
				};
				const legacyError = createLegacyTool(toolName, cwd, errorOptions);
				const runtimeError = createRuntimeRegistration(toolName, cwd, errorOptions);
				const legacyPromise = legacyError.execute("legacy-error", { command: "fail", timeout: 3 });
				const runtimePromise = runtimeError.tool.execute({
					sessionId: "session-1",
					turnId: "turn-1",
					toolCallId: "runtime-error",
					input: { command: "fail", timeout: 3 },
					signal: new AbortController().signal,
				});
				await expect(runtimePromise).rejects.toThrow(await getErrorMessage(legacyPromise));
			}
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});

async function getErrorMessage(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
		throw new Error("Expected command execution to fail");
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

describe("runtime command registration", () => {
	it("keeps bash and shell platform scopes mutually exclusive", () => {
		expect(getBashToolScopes("win32")).toEqual([]);
		expect(getShellToolScopes("win32")).not.toEqual([]);
		expect(getBashToolScopes("linux")).not.toEqual([]);
		expect(getShellToolScopes("linux")).toEqual([]);
	});

	it("forwards Runtime execution context through the command Port", async () => {
		const calls: Parameters<CommandToolExecutor["execute"]>[0][] = [];
		const executor: CommandToolExecutor = {
			async execute(request) {
				calls.push(request);
				return { content: [{ type: "text", text: "forwarded" }] };
			},
		};
		const registration = createBashToolRegistration("C:/workspace", { executor, platform: "linux" });
		const signal = new AbortController().signal;
		const result = await registration.tool.execute({
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "tool-call-1",
			input: { command: "echo forwarded" },
			signal,
		});

		expect(result).toEqual({ content: [{ type: "text", text: "forwarded" }] });
		expect(calls).toEqual([
			expect.objectContaining({
				toolName: "bash",
				cwd: "C:/workspace",
				toolCallId: "tool-call-1",
				input: { command: "echo forwarded" },
				signal,
			}),
		]);
	});

	it("executes a real local foreground command through the independent Runtime executor", async () => {
		const toolName: CommandName = process.platform === "win32" ? "shell" : "bash";
		const registration = createRuntimeRegistration(toolName, process.cwd(), {});
		const executable = `"${process.execPath}"`;
		const command = `${process.platform === "win32" ? "& " : ""}${executable} -e "process.stdout.write('runtime-command-ok')"`;
		const result = await registration.tool.execute({
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "tool-call-real-command",
			input: { command, timeout: 10 },
			signal: new AbortController().signal,
		});

		expect(result.content).toEqual([{ type: "text", text: "runtime-command-ok" }]);
	});
});
