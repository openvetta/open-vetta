import { spawn, spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import {
	createEditTool,
	createReadTool,
	createShellTool,
	createWriteTool,
	getShellConfig,
	type ShellOperations,
	type ToolDefinition,
} from "@vetta/coding-agent";
import { getSandboxShellGrant, type SandboxShellGrant } from "./sandbox-permissions.js";
import { wrapShellPermissionGuard, wrapWorkspaceGuard } from "./sandbox-tool-utils.js";

const MACOS_ENV_WHITELIST = ["PATH", "LANG", "LC_ALL", "TERM"] as const;
const MACOS_SANDBOX_BACKEND = "macos-seatbelt";

function killProcessGroup(pid: number): void {
	try {
		process.kill(-pid, "SIGKILL");
	} catch {
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// Process already exited.
		}
	}
}

function findOnPathUnix(binary: string): string | undefined {
	try {
		const result = spawnSync("which", [binary], { encoding: "utf-8", timeout: 5000 });
		if (result.status !== 0 || !result.stdout) return undefined;
		const firstMatch = result.stdout.trim().split(/\r?\n/)[0];
		return firstMatch && existsSync(firstMatch) ? firstMatch : undefined;
	} catch {
		return undefined;
	}
}

function resolveMacosSandboxExecPath(): string {
	const explicitPath = process.env.VETTA_MACOS_SANDBOX_EXEC_PATH?.trim();
	if (explicitPath) {
		if (isAbsolute(explicitPath) && existsSync(explicitPath)) return explicitPath;
		const resolved = findOnPathUnix(explicitPath);
		if (resolved) return resolved;
		throw new Error(`Configured macOS sandbox-exec binary does not exist: ${explicitPath}`);
	}

	if (existsSync("/usr/bin/sandbox-exec")) return "/usr/bin/sandbox-exec";
	const resolved = findOnPathUnix("sandbox-exec");
	if (resolved) return resolved;
	throw new Error(
		"macOS sandbox requires sandbox-exec. Could not locate /usr/bin/sandbox-exec or sandbox-exec on PATH.",
	);
}

function resolveMacosShellCommand(): { command: string; args: string[] } {
	const shellConfig = getShellConfig();
	const resolvedCommand = isAbsolute(shellConfig.shell) ? shellConfig.shell : findOnPathUnix(shellConfig.shell);
	if (!resolvedCommand) {
		throw new Error(`macOS sandbox shell not found on PATH: ${shellConfig.shell}`);
	}
	return {
		command: resolvedCommand,
		args: shellConfig.args,
	};
}

function normalizeExistingPath(path: string): string {
	return realpathSync(path);
}

function sbplString(value: string): string {
	return JSON.stringify(value);
}

function buildPathFilters(kind: "subpath" | "literal", paths: string[]): string {
	return paths.map((path) => `(${kind} ${sbplString(path)})`).join(" ");
}

function buildMacosSandboxProfile(cwd: string, tempRoot: string, grant: SandboxShellGrant | undefined): string {
	const homeDir = normalizeExistingPath(homedir());
	const realCwd = normalizeExistingPath(cwd);
	const realTempRoot = normalizeExistingPath(tempRoot);
	const tempDirs = Array.from(new Set([normalizeExistingPath(tmpdir()), "/tmp", "/private/tmp", realTempRoot]));
	const sensitiveReadDenyPaths = [
		join(homeDir, ".ssh"),
		join(homeDir, ".aws"),
		join(homeDir, ".gnupg"),
		join(homeDir, ".kube"),
		join(homeDir, ".docker"),
		join(homeDir, ".config", "gcloud"),
		join(homeDir, "Library", "Keychains"),
		join(homeDir, ".vetta"),
		join(homeDir, ".pi"),
	].filter((path) => path !== realCwd && !realCwd.startsWith(`${path}/`));
	const grantWriteRoots = (grant?.allowWriteRoots ?? [])
		.filter((path) => existsSync(path))
		.map((path) => normalizeExistingPath(path));
	const writablePaths = Array.from(new Set([realCwd, ...tempDirs, ...grantWriteRoots]));
	return [
		"(version 1)",
		"(deny default)",
		"(allow process*)",
		"(allow sysctl-read)",
		"(allow file-read*)",
		`(deny file-read* ${buildPathFilters("subpath", sensitiveReadDenyPaths)})`,
		`(allow file-write* ${buildPathFilters("subpath", writablePaths)})`,
	].join("\n");
}

function buildSandboxEnv(cwd: string, tempRoot: string, env: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
	const baseEnv = env ?? process.env;
	const nextEnv: NodeJS.ProcessEnv = {};
	for (const key of MACOS_ENV_WHITELIST) {
		const value = baseEnv[key];
		if (typeof value === "string" && value.length > 0) {
			nextEnv[key] = value;
		}
	}
	nextEnv.HOME = join(tempRoot, "home");
	nextEnv.TMPDIR = tempRoot;
	nextEnv.PWD = cwd;
	return nextEnv;
}

function createMacosSeatbeltShellOperations(sandboxExecPath: string): ShellOperations {
	const shellCommand = resolveMacosShellCommand();

	return {
		exec: (command, cwd, { onData, signal, timeout, env }) => {
			return new Promise<{ exitCode: number | null }>((resolve, reject) => {
				void (async () => {
					if (!existsSync(cwd)) {
						reject(new Error(`Working directory does not exist: ${cwd}`));
						return;
					}

					const tempRoot = await mkdtemp(join(tmpdir(), "vetta-macos-sandbox-"));
					await mkdir(join(tempRoot, "home"), { recursive: true });
					const profilePath = join(tempRoot, "profile.sb");
					const grant = getSandboxShellGrant(cwd);
					await writeFile(profilePath, buildMacosSandboxProfile(cwd, tempRoot, grant), "utf8");

					const args = ["-f", profilePath, shellCommand.command, ...shellCommand.args, command];
					const child = spawn(sandboxExecPath, args, {
						cwd,
						detached: true,
						env: buildSandboxEnv(cwd, tempRoot, env),
						stdio: ["ignore", "pipe", "pipe"],
					});

					let timedOut = false;
					let timeoutHandle: NodeJS.Timeout | undefined;

					if (typeof timeout === "number" && timeout > 0) {
						timeoutHandle = setTimeout(() => {
							timedOut = true;
							if (child.pid) {
								killProcessGroup(child.pid);
							}
						}, timeout * 1000);
					}

					if (child.stdout) child.stdout.on("data", onData);
					if (child.stderr) child.stderr.on("data", onData);

					const cleanup = (): void => {
						void rm(tempRoot, { recursive: true, force: true });
					};
					const onAbort = () => {
						if (child.pid) {
							killProcessGroup(child.pid);
						}
					};
					if (signal) {
						if (signal.aborted) {
							onAbort();
						} else {
							signal.addEventListener("abort", onAbort, { once: true });
						}
					}

					child.on("error", (err) => {
						if (timeoutHandle) clearTimeout(timeoutHandle);
						if (signal) signal.removeEventListener("abort", onAbort);
						cleanup();
						reject(err);
					});

					child.on("close", (code) => {
						if (timeoutHandle) clearTimeout(timeoutHandle);
						if (signal) signal.removeEventListener("abort", onAbort);
						cleanup();
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
				})().catch((error: unknown) => {
					reject(error);
				});
			});
		},
	};
}

export interface MacosSeatbeltToolOptions {
	cwd: string;
	sandboxExecPath?: string;
}

export function buildMacosSeatbeltToolDefinitions(options: MacosSeatbeltToolOptions): ToolDefinition[] {
	const { cwd } = options;
	const sandboxExecPath = options.sandboxExecPath ?? resolveMacosSandboxExecPath();

	const readTool = createReadTool(cwd);
	const writeTool = createWriteTool(cwd);
	const editTool = createEditTool(cwd);
	const shellTool = createShellTool(cwd, {
		operations: createMacosSeatbeltShellOperations(sandboxExecPath),
	});

	return [
		wrapWorkspaceGuard(readTool, cwd),
		wrapWorkspaceGuard(writeTool, cwd),
		wrapWorkspaceGuard(editTool, cwd),
		wrapShellPermissionGuard(shellTool, cwd),
	];
}

export function resolveAvailableMacosSandboxExecPath(): string | undefined {
	try {
		return resolveMacosSandboxExecPath();
	} catch {
		return undefined;
	}
}

export const macosSeatbeltBackend = MACOS_SANDBOX_BACKEND;
