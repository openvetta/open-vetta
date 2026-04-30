import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, resolve as resolvePath } from "node:path";
import {
	createBashTool,
	createEditTool,
	createReadTool,
	createWriteTool,
	getShellConfig,
	type ShellOperations,
	type ToolDefinition,
} from "@vetta/coding-agent";
import { getSandboxShellGrant, type SandboxShellGrant } from "./sandbox-permissions.js";
import { wrapShellPermissionGuard, wrapWorkspaceGuard } from "./sandbox-tool-utils.js";

const LINUX_ENV_WHITELIST = ["PATH", "LANG", "LC_ALL", "TERM"] as const;
const SANDBOX_HOME = "/tmp/vetta-home";
const STANDARD_READ_ONLY_ROOTS = ["/usr", "/bin", "/sbin", "/lib", "/lib64", "/etc"] as const;

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

function resolveLinuxBubblewrapPath(explicitPath?: string): string {
	const explicitCandidates = [explicitPath, process.env.VETTA_LINUX_BWRAP_PATH].filter(
		(value): value is string => typeof value === "string" && value.trim().length > 0,
	);

	for (const candidate of explicitCandidates) {
		if (isAbsolute(candidate) && existsSync(candidate)) {
			return candidate;
		}
		const resolved = findOnPathUnix(candidate);
		if (resolved) return resolved;
	}

	const pathCandidates = ["bwrap", "bubblewrap"];
	for (const candidate of pathCandidates) {
		const resolved = findOnPathUnix(candidate);
		if (resolved) return resolved;
	}

	const searched = [...explicitCandidates, ...pathCandidates].map((item) => `  - ${item}`).join("\n");
	throw new Error(
		"Linux sandbox requires bubblewrap. Install `bwrap`/`bubblewrap` or set VETTA_LINUX_BWRAP_PATH." +
			`\nSearched:\n${searched}`,
	);
}

function resolveLinuxShellCommand(): { command: string; args: string[] } {
	const shellConfig = getShellConfig();
	const resolvedCommand = isAbsolute(shellConfig.shell) ? shellConfig.shell : findOnPathUnix(shellConfig.shell);

	if (!resolvedCommand) {
		throw new Error(`Linux sandbox shell not found on PATH: ${shellConfig.shell}`);
	}

	return {
		command: resolvedCommand,
		args: shellConfig.args,
	};
}

function ensureShellIsWithinMountedRoots(shellPath: string): void {
	const normalizedShellPath = resolvePath(shellPath);
	const isAllowed = STANDARD_READ_ONLY_ROOTS.some((root) => {
		const normalizedRoot = resolvePath(root);
		return normalizedShellPath === normalizedRoot || normalizedShellPath.startsWith(`${normalizedRoot}/`);
	});

	if (!isAllowed) {
		throw new Error(
			`Linux sandbox cannot run shell outside standard system roots: ${normalizedShellPath}` +
				"\nConfigure shellPath to a binary under /usr, /bin, /sbin, /lib, /lib64, or /etc.",
		);
	}
}

function appendParentDirs(args: string[], targetPath: string, createdDirs: Set<string>): void {
	const segments = resolvePath(targetPath).split("/").filter(Boolean);
	let current = "";
	for (let index = 0; index < segments.length - 1; index++) {
		current += `/${segments[index]}`;
		if (createdDirs.has(current)) continue;
		args.push("--dir", current);
		createdDirs.add(current);
	}
}

function buildLinuxSandboxArgs(
	command: string,
	cwd: string,
	shellCommand: { command: string; args: string[] },
	env: NodeJS.ProcessEnv | undefined,
	grant: SandboxShellGrant | undefined,
): string[] {
	const args: string[] = [
		"--die-with-parent",
		"--new-session",
		"--unshare-pid",
		"--unshare-ipc",
		"--unshare-uts",
		"--unshare-net",
	];
	const createdDirs = new Set<string>();
	const mountedRoots = new Set<string>();

	appendParentDirs(args, cwd, createdDirs);
	for (const root of STANDARD_READ_ONLY_ROOTS) {
		if (!existsSync(root) || mountedRoots.has(root)) continue;
		args.push("--ro-bind", root, root);
		mountedRoots.add(root);
	}

	args.push("--proc", "/proc", "--dev", "/dev", "--bind", cwd, cwd);
	for (const root of grant?.allowWriteRoots ?? []) {
		const normalizedRoot = resolvePath(root);
		if (!existsSync(normalizedRoot) || mountedRoots.has(normalizedRoot)) continue;
		appendParentDirs(args, normalizedRoot, createdDirs);
		args.push("--bind", normalizedRoot, normalizedRoot);
		mountedRoots.add(normalizedRoot);
	}
	args.push("--tmpfs", "/tmp", "--dir", SANDBOX_HOME);

	const baseEnv = env ?? process.env;
	args.push("--clearenv");
	for (const key of LINUX_ENV_WHITELIST) {
		const value = baseEnv[key];
		if (typeof value === "string" && value.length > 0) {
			args.push("--setenv", key, value);
		}
	}
	args.push("--setenv", "HOME", SANDBOX_HOME);
	args.push("--setenv", "TMPDIR", "/tmp");
	args.push("--setenv", "PWD", cwd);
	args.push("--chdir", cwd);
	args.push("--", shellCommand.command, ...shellCommand.args, command);

	return args;
}

function createLinuxBubblewrapShellOperations(bubblewrapPath: string): ShellOperations {
	const shellCommand = resolveLinuxShellCommand();
	ensureShellIsWithinMountedRoots(shellCommand.command);

	return {
		exec: (command, cwd, { onData, signal, timeout, env }) => {
			return new Promise<{ exitCode: number | null }>((resolve, reject) => {
				if (!existsSync(cwd)) {
					reject(new Error(`Working directory does not exist: ${cwd}`));
					return;
				}

				const grant = getSandboxShellGrant(cwd);
				const args = buildLinuxSandboxArgs(command, cwd, shellCommand, env, grant);
				const child = spawn(bubblewrapPath, args, {
					cwd,
					detached: true,
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
					reject(err);
				});

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
}

export interface LinuxBubblewrapToolOptions {
	cwd: string;
	bubblewrapPath?: string;
	getSessionId?: () => string | undefined;
}

export function buildLinuxBubblewrapToolDefinitions(options: LinuxBubblewrapToolOptions): ToolDefinition[] {
	const { cwd } = options;
	const bubblewrapPath = resolveLinuxBubblewrapPath(options.bubblewrapPath);
	const guardCtx = { getSessionId: options.getSessionId };

	const readTool = createReadTool(cwd);
	const writeTool = createWriteTool(cwd);
	const editTool = createEditTool(cwd);
	// Use createBashTool (name="bash") rather than createShellTool (name="shell")
	// so that on Linux — where the default active command tool is "bash" — this
	// custom tool actually overrides the unsandboxed default in the registry.
	const bashTool = createBashTool(cwd, {
		operations: createLinuxBubblewrapShellOperations(bubblewrapPath),
	});

	return [
		wrapWorkspaceGuard(readTool, cwd, guardCtx),
		wrapWorkspaceGuard(writeTool, cwd, guardCtx),
		wrapWorkspaceGuard(editTool, cwd, guardCtx),
		wrapShellPermissionGuard(bashTool, cwd, guardCtx),
	];
}
