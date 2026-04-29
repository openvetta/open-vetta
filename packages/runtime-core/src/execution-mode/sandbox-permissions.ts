import { AsyncLocalStorage } from "node:async_hooks";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve as resolvePath } from "node:path";
import type { ExtensionContext } from "@vetta/coding-agent";

export type SandboxPermissionCapability = "file.read" | "file.write" | "network";

export interface SandboxPermissionRequest {
	capability: SandboxPermissionCapability;
	toolName: string;
	target: string;
	resolvedTarget: string;
	grantRoot?: string;
	reason: string;
	command?: string;
}

export interface SandboxShellGrant {
	allowReadRoots: string[];
	allowWriteRoots: string[];
}

interface SandboxShellGrantContext {
	cwd: string;
	grant: SandboxShellGrant;
}

const shellGrantStorage = new AsyncLocalStorage<SandboxShellGrantContext>();

function expandHome(inputPath: string): string {
	if (inputPath === "~") return homedir();
	if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) return resolvePath(homedir(), inputPath.slice(2));
	return inputPath;
}

export function resolveSandboxPath(inputPath: string, cwd: string): string {
	const expanded = expandHome(inputPath.trim());
	return isAbsolute(expanded) ? resolvePath(expanded) : resolvePath(cwd, expanded);
}

export function isPathInsideRoot(targetPath: string, rootPath: string): boolean {
	const normalizedTarget =
		process.platform === "win32" ? resolvePath(targetPath).toLowerCase() : resolvePath(targetPath);
	const normalizedRoot = process.platform === "win32" ? resolvePath(rootPath).toLowerCase() : resolvePath(rootPath);
	const rel = relative(normalizedRoot, normalizedTarget);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function isAllowedSandboxPath(targetPath: string, cwd: string): boolean {
	const allowedRoots = [cwd, tmpdir(), "/tmp", "/private/tmp"];
	return allowedRoots.some((root) => isPathInsideRoot(targetPath, root));
}

export function getSandboxDenyRoots(): string[] {
	const homeDir = homedir();
	const roots = [
		join(homeDir, ".ssh"),
		join(homeDir, ".aws"),
		join(homeDir, ".gnupg"),
		join(homeDir, ".kube"),
		join(homeDir, ".docker"),
		join(homeDir, ".vetta", "agent"),
		join(homeDir, ".pi"),
	];
	if (process.platform === "darwin") {
		roots.push(join(homeDir, ".config", "gcloud"), join(homeDir, "Library", "Keychains"));
	}
	if (process.platform === "win32") {
		const appData = process.env.APPDATA;
		if (appData) roots.push(join(appData, "gcloud"), join(appData, "Vetta"));
	}
	return Array.from(new Set(roots.map((root) => resolvePath(root))));
}

export function isDeniedSandboxPath(targetPath: string): boolean {
	return getSandboxDenyRoots().some((root) => isPathInsideRoot(targetPath, root));
}

export function assertSandboxPathNotDenied(targetPath: string, toolName: string): void {
	if (!isDeniedSandboxPath(targetPath)) return;
	throw new Error(
		`Access denied by sandbox: "${targetPath}" is in a sensitive sandbox deny path for tool "${toolName}".`,
	);
}

function shouldSkipShellPath(rawPath: string): boolean {
	const trimmed = rawPath.trim();
	if (trimmed.length === 0) return true;
	return /[$`*?[\]{}()]/.test(trimmed);
}

function unquoteShellToken(token: string): string {
	const trimmed = token.trim();
	if (trimmed.length < 2) return trimmed;
	const quote = trimmed[0];
	if ((quote === '"' || quote === "'") && trimmed[trimmed.length - 1] === quote) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function collectRegexPathMatches(command: string, regex: RegExp): string[] {
	const matches: string[] = [];
	let match = regex.exec(command);
	while (match !== null) {
		const rawPath = match[1] ?? match[2] ?? match[3];
		if (rawPath) matches.push(unquoteShellToken(rawPath));
		match = regex.exec(command);
	}
	return matches;
}

function unique(values: string[]): string[] {
	return Array.from(new Set(values));
}

export function collectShellWritePermissionRequests(command: string, cwd: string): SandboxPermissionRequest[] {
	const redirectPaths = collectRegexPathMatches(
		command,
		/(?:^|[\s;&|])(?:\d?>|\d?>>|&>|>|>>)\s*(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/g,
	);
	const teePaths = collectRegexPathMatches(
		command,
		/(?:^|[\s;&|])tee(?:\s+-[a-zA-Z]+)*\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/g,
	);

	return unique([...redirectPaths, ...teePaths])
		.filter((rawPath) => !shouldSkipShellPath(rawPath))
		.map((rawPath) => {
			const resolvedTarget = resolveSandboxPath(rawPath, cwd);
			assertSandboxPathNotDenied(resolvedTarget, "shell");
			const grantRoot = dirname(resolvedTarget);
			return { rawPath, resolvedTarget, grantRoot };
		})
		.filter(({ resolvedTarget }) => !isAllowedSandboxPath(resolvedTarget, cwd))
		.map(({ rawPath, resolvedTarget, grantRoot }) => ({
			capability: "file.write",
			toolName: "shell",
			target: rawPath,
			resolvedTarget,
			grantRoot,
			reason: "shell command writes outside the workspace sandbox",
			command,
		}));
}

export async function confirmSandboxPermission(
	ctx: ExtensionContext,
	request: SandboxPermissionRequest,
): Promise<boolean> {
	if (!ctx.hasUI) return false;
	const title = "沙箱权限请求";
	const lines = [
		`工具：${request.toolName}`,
		`权限：${request.capability}`,
		`目标：${request.target}`,
		`解析路径：${request.resolvedTarget}`,
		request.grantRoot ? `本次授权目录：${request.grantRoot}` : undefined,
		request.command ? `命令：${request.command}` : undefined,
		"",
		"该授权仅对当前工具调用生效。拒绝后，本次操作不会执行。",
	].filter((line): line is string => typeof line === "string");
	return ctx.ui.confirm(title, lines.join("\n"));
}

export function runWithSandboxShellGrant<T>(
	cwd: string,
	grant: SandboxShellGrant,
	callback: () => Promise<T>,
): Promise<T> {
	return shellGrantStorage.run({ cwd: resolvePath(cwd), grant }, callback);
}

export function getSandboxShellGrant(cwd: string): SandboxShellGrant | undefined {
	const context = shellGrantStorage.getStore();
	if (!context || context.cwd !== resolvePath(cwd)) return undefined;
	return context.grant;
}
