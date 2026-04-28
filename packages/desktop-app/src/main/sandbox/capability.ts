import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { isAbsolute, resolve as resolvePath } from "node:path";
import type { SessionExecutionMode } from "../../../../runtime-core/src/index.js";
import { type LinuxSandboxBackend, resolveLinuxBubblewrapBinary } from "./binary-resolver.js";

export type SandboxStatus = "unknown" | "available" | "unavailable";
export type SandboxBackend = LinuxSandboxBackend | "macos-seatbelt" | "windows-host" | null;

export interface SandboxCapability {
	status: SandboxStatus;
	backend: SandboxBackend;
	platform: NodeJS.Platform;
	binaryPath?: string;
	reason?: string;
	details?: string;
	checkedAt?: number;
}

export type LinuxSandboxStatus = SandboxStatus;
export interface LinuxSandboxCapability extends SandboxCapability {
	backend: LinuxSandboxBackend | null;
}

const STANDARD_READ_ONLY_ROOTS = ["/usr", "/bin", "/sbin", "/lib", "/lib64", "/etc"] as const;
const PROBE_HOME = "/tmp/vetta-probe-home";

let sandboxCapability: SandboxCapability = {
	status: "unknown",
	backend: null,
	platform: process.platform,
};

function buildLinuxProbeArgs(commandPath: string): string[] {
	const args: string[] = [
		"--die-with-parent",
		"--new-session",
		"--unshare-pid",
		"--unshare-ipc",
		"--unshare-uts",
		"--unshare-net",
	];

	for (const root of STANDARD_READ_ONLY_ROOTS) {
		if (!existsSync(root)) continue;
		args.push("--ro-bind", root, root);
	}

	args.push("--proc", "/proc", "--dev", "/dev");
	args.push("--tmpfs", "/tmp", "--dir", PROBE_HOME);
	args.push("--clearenv", "--setenv", "HOME", PROBE_HOME);
	args.push("--", commandPath);
	return args;
}

function resolveLinuxProbeCommandPath(): string | undefined {
	for (const candidate of ["/usr/bin/true", "/bin/true"]) {
		if (existsSync(candidate)) return candidate;
	}
	return undefined;
}

function classifyLinuxProbeFailure(stderr: string, errorCode?: string): { reason: string; details: string } {
	const lowered = stderr.toLowerCase();
	if (errorCode === "EACCES") {
		return {
			reason: "binary_not_executable",
			details: stderr || "The Linux sandbox binary exists but is not executable.",
		};
	}
	if (
		lowered.includes("no permissions to create new namespace") ||
		lowered.includes("creating new namespace failed") ||
		lowered.includes("user namespace") ||
		lowered.includes("operation not permitted")
	) {
		return {
			reason: "userns_unavailable",
			details: stderr || "The host Linux environment does not allow the required namespace operations.",
		};
	}
	return {
		reason: "probe_command_failed",
		details: stderr || "The Linux sandbox probe command failed.",
	};
}

function findOnPathUnix(binary: string): string | undefined {
	const pathValue = process.env.PATH;
	if (!pathValue) return undefined;

	for (const entry of pathValue.split(":")) {
		if (!entry) continue;
		const candidate = resolvePath(entry, binary);
		if (!existsSync(candidate)) continue;
		try {
			accessSync(candidate, constants.X_OK);
			return candidate;
		} catch {
			// Ignore non-executable matches.
		}
	}

	return undefined;
}

function resolveMacosSandboxExecPath(): string | undefined {
	const explicitPath = process.env.VETTA_MACOS_SANDBOX_EXEC_PATH?.trim();
	if (explicitPath) {
		if (isAbsolute(explicitPath)) {
			if (!existsSync(explicitPath)) {
				throw new Error(`Configured macOS sandbox-exec binary does not exist: ${explicitPath}`);
			}
			accessSync(explicitPath, constants.X_OK);
			return explicitPath;
		}
		const resolved = findOnPathUnix(explicitPath);
		if (resolved) return resolved;
		throw new Error(`Configured macOS sandbox-exec binary does not exist on PATH: ${explicitPath}`);
	}
	if (existsSync("/usr/bin/sandbox-exec")) return "/usr/bin/sandbox-exec";
	return findOnPathUnix("sandbox-exec");
}

function buildMacosProbeProfile(): string {
	return ["(version 1)", "(deny default)", "(allow process*)", "(allow file-read*)"].join("\n");
}

function probeLinuxSandbox(): SandboxCapability {
	const resolved = resolveLinuxBubblewrapBinary();
	if (!resolved) {
		return {
			status: "unavailable",
			backend: null,
			platform: process.platform,
			reason: "binary_not_found",
			details: "No bundled or system bubblewrap binary was found.",
			checkedAt: Date.now(),
		};
	}

	const probeCommandPath = resolveLinuxProbeCommandPath();
	if (!probeCommandPath) {
		return {
			status: "unavailable",
			backend: resolved.backend,
			platform: process.platform,
			binaryPath: resolved.path,
			reason: "probe_command_failed",
			details: "Could not locate /usr/bin/true or /bin/true for sandbox probing.",
			checkedAt: Date.now(),
		};
	}

	const result = spawnSync(resolved.path, buildLinuxProbeArgs(probeCommandPath), {
		encoding: "utf-8",
		timeout: 5000,
	});

	if (result.error) {
		const classified = classifyLinuxProbeFailure(result.stderr ?? "", (result.error as NodeJS.ErrnoException).code);
		return {
			status: "unavailable",
			backend: resolved.backend,
			platform: process.platform,
			binaryPath: resolved.path,
			reason: classified.reason,
			details: result.error.message || classified.details,
			checkedAt: Date.now(),
		};
	}

	if (result.status !== 0) {
		const classified = classifyLinuxProbeFailure(result.stderr ?? "");
		return {
			status: "unavailable",
			backend: resolved.backend,
			platform: process.platform,
			binaryPath: resolved.path,
			reason: classified.reason,
			details: classified.details,
			checkedAt: Date.now(),
		};
	}

	return {
		status: "available",
		backend: resolved.backend,
		platform: process.platform,
		binaryPath: resolved.path,
		checkedAt: Date.now(),
	};
}

function probeMacosSandbox(): SandboxCapability {
	const sandboxExecPath = resolveMacosSandboxExecPath();
	if (!sandboxExecPath) {
		return {
			status: "unavailable",
			backend: "macos-seatbelt",
			platform: process.platform,
			reason: "binary_not_found",
			details: "Could not locate /usr/bin/sandbox-exec or sandbox-exec on PATH.",
			checkedAt: Date.now(),
		};
	}

	const result = spawnSync(sandboxExecPath, ["-p", buildMacosProbeProfile(), "/usr/bin/true"], {
		encoding: "utf-8",
		timeout: 5000,
	});

	if (result.error) {
		return {
			status: "unavailable",
			backend: "macos-seatbelt",
			platform: process.platform,
			binaryPath: sandboxExecPath,
			reason:
				(result.error as NodeJS.ErrnoException).code === "EACCES"
					? "binary_not_executable"
					: "probe_command_failed",
			details: result.error.message,
			checkedAt: Date.now(),
		};
	}

	if (result.status !== 0) {
		return {
			status: "unavailable",
			backend: "macos-seatbelt",
			platform: process.platform,
			binaryPath: sandboxExecPath,
			reason: "probe_command_failed",
			details: result.stderr || "The macOS sandbox probe command failed.",
			checkedAt: Date.now(),
		};
	}

	return {
		status: "available",
		backend: "macos-seatbelt",
		platform: process.platform,
		binaryPath: sandboxExecPath,
		checkedAt: Date.now(),
	};
}

export async function initializeSandboxCapability(): Promise<SandboxCapability> {
	try {
		if (process.platform === "linux") {
			sandboxCapability = probeLinuxSandbox();
			return sandboxCapability;
		}
		if (process.platform === "darwin") {
			sandboxCapability = probeMacosSandbox();
			return sandboxCapability;
		}
		if (process.platform === "win32") {
			sandboxCapability = {
				status: "available",
				backend: "windows-host",
				platform: process.platform,
				checkedAt: Date.now(),
			};
			return sandboxCapability;
		}

		sandboxCapability = {
			status: "unavailable",
			backend: null,
			platform: process.platform,
			reason: "unsupported_platform",
			details: `Sandbox probe skipped on platform ${process.platform}.`,
			checkedAt: Date.now(),
		};
		return sandboxCapability;
	} catch (error) {
		sandboxCapability = {
			status: "unavailable",
			backend: null,
			platform: process.platform,
			reason: "unknown_error",
			details: error instanceof Error ? error.message : String(error),
			checkedAt: Date.now(),
		};
		return sandboxCapability;
	}
}

export async function initializeLinuxSandboxCapability(): Promise<LinuxSandboxCapability> {
	const capability = await initializeSandboxCapability();
	return {
		...capability,
		backend:
			capability.backend === "bundled-bwrap" || capability.backend === "system-bwrap" ? capability.backend : null,
	};
}

export function getSandboxCapability(): SandboxCapability {
	return { ...sandboxCapability };
}

export function getLinuxSandboxCapability(): LinuxSandboxCapability {
	return {
		...sandboxCapability,
		backend:
			sandboxCapability.backend === "bundled-bwrap" || sandboxCapability.backend === "system-bwrap"
				? sandboxCapability.backend
				: null,
	};
}

export function getAvailableLinuxBubblewrapPath(): string | undefined {
	return sandboxCapability.backend === "bundled-bwrap" || sandboxCapability.backend === "system-bwrap"
		? sandboxCapability.binaryPath
		: undefined;
}

export function getAvailableMacosSandboxExecPath(): string | undefined {
	return sandboxCapability.status === "available" && sandboxCapability.backend === "macos-seatbelt"
		? sandboxCapability.binaryPath
		: undefined;
}

export function formatSandboxUnavailableMessage(capability: SandboxCapability): string {
	const reason = capability.reason ?? "unknown_error";
	const details = capability.details ? `\n${capability.details}` : "";
	const binaryPath = capability.binaryPath ? `\npath=${resolvePath(capability.binaryPath)}` : "";
	return `Sandbox is unavailable on ${capability.platform} (${reason}).${binaryPath}${details}`;
}

export function formatLinuxSandboxUnavailableMessage(capability: LinuxSandboxCapability): string {
	const reason = capability.reason ?? "unknown_error";
	const details = capability.details ? `\n${capability.details}` : "";
	const binaryPath = capability.binaryPath ? `\npath=${resolvePath(capability.binaryPath)}` : "";
	return `Linux sandbox is unavailable (${reason}).${binaryPath}${details}`;
}

export async function assertSandboxAvailableForMode(
	requestedMode: SessionExecutionMode | undefined,
	resolveDefaultMode: () => Promise<SessionExecutionMode>,
): Promise<void> {
	const effectiveMode = requestedMode ?? (await resolveDefaultMode());
	if (effectiveMode !== "sandbox") return;
	if (sandboxCapability.status === "unknown") {
		await initializeSandboxCapability();
	}
	if (sandboxCapability.status === "available") return;
	throw new Error(formatSandboxUnavailableMessage(sandboxCapability));
}

export async function assertLinuxSandboxAvailableForMode(
	requestedMode: SessionExecutionMode | undefined,
	resolveDefaultMode: () => Promise<SessionExecutionMode>,
): Promise<void> {
	if (process.platform !== "linux") return;
	await assertSandboxAvailableForMode(requestedMode, resolveDefaultMode);
}
