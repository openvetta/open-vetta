import { describe, expect, it } from "vitest";
import { createLegacyCommandToolExecutor } from "../../../../coding-agent/src/adapters/runtime-tools/command-executor.js";
import {
	type BashOperations,
	type BashToolOptions,
	createBashTool as createLegacyBashTool,
} from "../../../../coding-agent/src/core/tools/bash/index.js";
import { createShellTool as createLegacyShellTool } from "../../../../coding-agent/src/core/tools/shell/index.js";
import {
	type CommandToolExecutor,
	createBashToolRegistration,
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
	const executor = createLegacyCommandToolExecutor({ toolOptions });
	return name === "bash"
		? createBashToolRegistration(cwd, { executor })
		: createShellToolRegistration(cwd, { executor });
}

describe.each(["bash", "shell"] as const)("runtime %s command adapter", (toolName) => {
	it("preserves the legacy definition, scope, output, details, and updates", async () => {
		const cwd = "C:/workspace";
		const toolOptions: BashToolOptions = {
			operations: createOperations("command output\n"),
			commandPrefix: "echo prefix",
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
});

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

	it("executes a real local foreground command through the compatibility adapter", async () => {
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
