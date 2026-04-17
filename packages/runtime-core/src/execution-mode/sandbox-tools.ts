import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentTool, AgentToolUpdateCallback } from "@mariozechner/pi-agent-core";
import {
	createEditTool,
	createReadTool,
	createShellTool,
	createWriteTool,
	type ShellOperations,
	type ToolDefinition,
} from "@vetta/coding-agent";
import { assertWorkspacePathAllowed } from "./workspace-guard.js";

const WINDOWS_SANDBOX_HOST_FILENAME = "codex-windows-sandbox-host.exe";
const WINDOWS_SANDBOX_HOST_RELATIVE_DIRS = ["sandbox/windows-sandbox-cli", "sandbox"] as const;
const PATH_ID_REGEX = /^@PATH_\d{4}$/i;
const ENV_WHITELIST = ["PATH", "SystemRoot", "TEMP", "TMP", "COMSPEC"] as const;
type WindowsSandboxBackend = "auto" | "elevated" | "unelevated";

// AgentTool parameter types are intentionally tool-specific and not covariant.
// We keep this adapter narrow and centralized to bridge built-in tools into
// ToolDefinition without duplicating per-tool wrappers.
function toToolDefinition(tool: AgentTool<any, any>): ToolDefinition {
	return {
		name: tool.name,
		label: tool.label,
		description: tool.description,
		parameters: tool.parameters,
		execute: async (
			toolCallId: string,
			params: unknown,
			signal: AbortSignal | undefined,
			onUpdate: AgentToolUpdateCallback<unknown> | undefined,
		) => {
			return tool.execute(toolCallId, params as never, signal, onUpdate as never);
		},
	};
}

function extractPathFromParams(params: unknown): string | undefined {
	if (!params || typeof params !== "object") return undefined;
	if (!("path" in params)) return undefined;
	const pathValue = (params as { path?: unknown }).path;
	return typeof pathValue === "string" ? pathValue : undefined;
}

function wrapWorkspaceGuard(tool: AgentTool<any, any>, cwd: string): ToolDefinition {
	const definition = toToolDefinition(tool);
	return {
		...definition,
		execute: async (toolCallId, params, signal, onUpdate, ctx) => {
			const requestedPath = extractPathFromParams(params);
			if (requestedPath && !PATH_ID_REGEX.test(requestedPath.trim())) {
				await assertWorkspacePathAllowed(requestedPath, cwd, definition.name);
			}
			return definition.execute(toolCallId, params, signal, onUpdate, ctx);
		},
	};
}

function resolveWindowsSandboxHostPath(explicitPath?: string): string {
	const moduleDir = dirname(fileURLToPath(import.meta.url));
	const runtimeCoreRootCandidates = [
		resolvePath(moduleDir, "../.."),
		resolvePath(moduleDir, "../../../packages/runtime-core"),
		resolvePath(process.cwd(), "packages/runtime-core"),
		resolvePath(process.cwd(), "../runtime-core"),
		resolvePath(process.cwd(), "runtime-core"),
	];
	const autoDetectedCandidates = runtimeCoreRootCandidates.flatMap((rootDir) =>
		WINDOWS_SANDBOX_HOST_RELATIVE_DIRS.map((relativeDir) =>
			resolvePath(rootDir, relativeDir, WINDOWS_SANDBOX_HOST_FILENAME),
		),
	);

	const candidates = [explicitPath, process.env.VETTA_WINDOWS_SANDBOX_HOST_PATH, ...autoDetectedCandidates].filter(
		(value): value is string => typeof value === "string" && value.trim().length > 0,
	);

	for (const candidate of candidates) {
		if (existsSync(candidate)) return candidate;
	}

	const searched = candidates.map((item) => `  - ${item}`).join("\n");
	throw new Error(
		`Windows sandbox host not found. Set VETTA_WINDOWS_SANDBOX_HOST_PATH or place ${WINDOWS_SANDBOX_HOST_FILENAME} in packages/runtime-core/sandbox/windows-sandbox-cli.` +
			`\nSearched:\n${searched}`,
	);
}

function buildSandboxEnv(sourceEnv: NodeJS.ProcessEnv | undefined): string[] {
	const baseEnv = sourceEnv ?? process.env;
	const args: string[] = ["--clear-env"];
	for (const key of ENV_WHITELIST) {
		const value = baseEnv[key];
		if (typeof value === "string" && value.length > 0) {
			args.push("--env", `${key}=${value}`);
		}
	}
	return args;
}

function resolveWindowsSandboxBackend(): WindowsSandboxBackend {
	const raw = process.env.VETTA_WINDOWS_SANDBOX_BACKEND?.trim().toLowerCase();
	if (raw === "auto" || raw === "elevated" || raw === "unelevated") {
		return raw;
	}

	// Default to elevated for stricter sandbox isolation on configured hosts.
	return "elevated";
}

function resolveWindowsShellCommand(): { command: string; args: string[] } {
	const findOnPath = (binary: string): boolean => {
		try {
			const result = spawnSync("where", [binary], { encoding: "utf-8", timeout: 5000 });
			if (result.status !== 0 || !result.stdout) return false;
			const candidate = result.stdout.trim().split(/\r?\n/)[0];
			return typeof candidate === "string" && candidate.length > 0 && existsSync(candidate);
		} catch {
			return false;
		}
	};

	if (findOnPath("pwsh.exe")) {
		return {
			command: "pwsh.exe",
			args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"],
		};
	}
	if (findOnPath("powershell.exe")) {
		return {
			command: "powershell.exe",
			args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"],
		};
	}
	return { command: "cmd.exe", args: ["/d", "/s", "/c"] };
}

function createWindowsSandboxShellOperations(sandboxHostPath: string): ShellOperations {
	return {
		exec: (command, cwd, { onData, signal, timeout, env }) => {
			return new Promise<{ exitCode: number | null }>((resolve, reject) => {
				const shellCommand = resolveWindowsShellCommand();
				const backend = resolveWindowsSandboxBackend();
				const args = [
					"--backend",
					backend,
					"--policy",
					"workspace-write",
					"--policy-cwd",
					cwd,
					"--cwd",
					cwd,
					...buildSandboxEnv(env),
				];
				if (backend !== "unelevated") {
					// Enforce strict workspace boundary for shell commands.
					args.push("--read-root", cwd, "--write-root", cwd);
				}

				if (typeof timeout === "number" && timeout > 0) {
					args.push("--timeout-ms", String(Math.max(1, Math.floor(timeout * 1000))));
				}

				args.push("--", shellCommand.command, ...shellCommand.args, command);
				const child = spawn(sandboxHostPath, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });

				if (child.stdout) child.stdout.on("data", onData);
				if (child.stderr) child.stderr.on("data", onData);

				const onAbort = () => {
					child.kill();
				};
				if (signal) {
					if (signal.aborted) {
						onAbort();
					} else {
						signal.addEventListener("abort", onAbort, { once: true });
					}
				}

				child.on("error", (err) => {
					if (signal) signal.removeEventListener("abort", onAbort);
					reject(err);
				});

				child.on("close", (code) => {
					if (signal) signal.removeEventListener("abort", onAbort);
					if (signal?.aborted) {
						reject(new Error("aborted"));
						return;
					}
					if (code === 192 && typeof timeout === "number" && timeout > 0) {
						reject(new Error(`timeout:${timeout}`));
						return;
					}
					resolve({ exitCode: code });
				});
			});
		},
	};
}

export interface WindowsSandboxToolOptions {
	cwd: string;
	sandboxHostPath?: string;
}

export function buildWindowsSandboxToolDefinitions(options: WindowsSandboxToolOptions): ToolDefinition[] {
	const { cwd } = options;
	const sandboxHostPath = resolveWindowsSandboxHostPath(options.sandboxHostPath);

	const readTool = createReadTool(cwd);
	const writeTool = createWriteTool(cwd);
	const editTool = createEditTool(cwd);
	const shellTool = createShellTool(cwd, {
		operations: createWindowsSandboxShellOperations(sandboxHostPath),
	});

	return [
		wrapWorkspaceGuard(readTool, cwd),
		wrapWorkspaceGuard(writeTool, cwd),
		wrapWorkspaceGuard(editTool, cwd),
		toToolDefinition(shellTool),
	];
}
