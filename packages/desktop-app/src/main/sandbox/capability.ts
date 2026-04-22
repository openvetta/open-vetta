import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import type { SessionExecutionMode } from "../../../../runtime-core/src/index.js";
import { type LinuxSandboxBackend, resolveLinuxBubblewrapBinary } from "./binary-resolver.js";

export type LinuxSandboxStatus = "unknown" | "available" | "unavailable";

export interface LinuxSandboxCapability {
	status: LinuxSandboxStatus;
	backend: LinuxSandboxBackend | null;
	binaryPath?: string;
	reason?: string;
	details?: string;
	checkedAt?: number;
}

const STANDARD_READ_ONLY_ROOTS = ["/usr", "/bin", "/sbin", "/lib", "/lib64", "/etc"] as const;
const PROBE_HOME = "/tmp/vetta-probe-home";

let linuxSandboxCapability: LinuxSandboxCapability = {
	status: "unknown",
	backend: null,
};

function buildProbeArgs(commandPath: string): string[] {
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

function resolveProbeCommandPath(): string | undefined {
	for (const candidate of ["/usr/bin/true", "/bin/true"]) {
		if (existsSync(candidate)) return candidate;
	}
	return undefined;
}

function classifyProbeFailure(stderr: string, errorCode?: string): { reason: string; details: string } {
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

export async function initializeLinuxSandboxCapability(): Promise<LinuxSandboxCapability> {
	if (process.platform !== "linux") {
		linuxSandboxCapability = {
			status: "unavailable",
			backend: null,
			reason: "unsupported_platform",
			details: `Linux sandbox probe skipped on platform ${process.platform}.`,
			checkedAt: Date.now(),
		};
		return linuxSandboxCapability;
	}

	try {
		const resolved = resolveLinuxBubblewrapBinary();
		if (!resolved) {
			linuxSandboxCapability = {
				status: "unavailable",
				backend: null,
				reason: "binary_not_found",
				details: "No bundled or system bubblewrap binary was found.",
				checkedAt: Date.now(),
			};
			return linuxSandboxCapability;
		}

		const probeCommandPath = resolveProbeCommandPath();
		if (!probeCommandPath) {
			linuxSandboxCapability = {
				status: "unavailable",
				backend: resolved.backend,
				binaryPath: resolved.path,
				reason: "probe_command_failed",
				details: "Could not locate /usr/bin/true or /bin/true for sandbox probing.",
				checkedAt: Date.now(),
			};
			return linuxSandboxCapability;
		}

		const result = spawnSync(resolved.path, buildProbeArgs(probeCommandPath), {
			encoding: "utf-8",
			timeout: 5000,
		});

		if (result.error) {
			const classified = classifyProbeFailure(result.stderr ?? "", (result.error as NodeJS.ErrnoException).code);
			linuxSandboxCapability = {
				status: "unavailable",
				backend: resolved.backend,
				binaryPath: resolved.path,
				reason: classified.reason,
				details: result.error.message || classified.details,
				checkedAt: Date.now(),
			};
			return linuxSandboxCapability;
		}

		if (result.status !== 0) {
			const classified = classifyProbeFailure(result.stderr ?? "");
			linuxSandboxCapability = {
				status: "unavailable",
				backend: resolved.backend,
				binaryPath: resolved.path,
				reason: classified.reason,
				details: classified.details,
				checkedAt: Date.now(),
			};
			return linuxSandboxCapability;
		}

		linuxSandboxCapability = {
			status: "available",
			backend: resolved.backend,
			binaryPath: resolved.path,
			checkedAt: Date.now(),
		};
		return linuxSandboxCapability;
	} catch (error) {
		linuxSandboxCapability = {
			status: "unavailable",
			backend: null,
			reason: "unknown_error",
			details: error instanceof Error ? error.message : String(error),
			checkedAt: Date.now(),
		};
		return linuxSandboxCapability;
	}
}

export function getLinuxSandboxCapability(): LinuxSandboxCapability {
	return { ...linuxSandboxCapability };
}

export function getAvailableLinuxBubblewrapPath(): string | undefined {
	return linuxSandboxCapability.status === "available" ? linuxSandboxCapability.binaryPath : undefined;
}

export function formatLinuxSandboxUnavailableMessage(capability: LinuxSandboxCapability): string {
	const reason = capability.reason ?? "unknown_error";
	const details = capability.details ? `\n${capability.details}` : "";
	const binaryPath = capability.binaryPath ? `\npath=${resolvePath(capability.binaryPath)}` : "";
	return `Linux sandbox is unavailable (${reason}).${binaryPath}${details}`;
}

export async function assertLinuxSandboxAvailableForMode(
	requestedMode: SessionExecutionMode | undefined,
	resolveDefaultMode: () => Promise<SessionExecutionMode>,
): Promise<void> {
	if (process.platform !== "linux") return;
	const effectiveMode = requestedMode ?? (await resolveDefaultMode());
	if (effectiveMode !== "sandbox") return;
	if (linuxSandboxCapability.status === "available") return;
	throw new Error(formatLinuxSandboxUnavailableMessage(linuxSandboxCapability));
}
