import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, delimiter, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEV_CLI_DIR = ".desktop-dev";
const LAUNCHER_SOURCE_NAME = "vetta-dev-cli-launcher.js";
const LAUNCHER_BINARY_BASE_NAME = "vetta-dev-cli-launcher";

interface DevCliShimOptions {
	appRoot: string;
	electronPath: string;
	mainEntryPath: string;
}

async function isExecutable(path: string): Promise<boolean> {
	try {
		await access(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

async function writeFileIfChanged(path: string, content: string): Promise<boolean> {
	try {
		const current = await readFile(path, "utf8");
		if (current === content) return false;
	} catch {
		// Missing or unreadable launcher source: rewrite it below.
	}
	await writeFile(path, content, "utf8");
	return true;
}

async function needsCompile(sourcePath: string, binaryPath: string, sourceChanged: boolean): Promise<boolean> {
	if (sourceChanged) return true;
	try {
		const [sourceStats, binaryStats] = await Promise.all([stat(sourcePath), stat(binaryPath)]);
		return sourceStats.mtimeMs > binaryStats.mtimeMs;
	} catch {
		return true;
	}
}

function createLauncherSource(options: DevCliShimOptions): string {
	return `import { spawnSync } from "node:child_process";

const electronPath = ${JSON.stringify(options.electronPath)};
const mainEntryPath = ${JSON.stringify(options.mainEntryPath)};
const appRoot = ${JSON.stringify(options.appRoot)};

const result = spawnSync(electronPath, [mainEntryPath, ...process.argv.slice(2)], {
\tcwd: appRoot,
\tstdio: "inherit",
\twindowsHide: true,
});

if (result.error) {
\tconsole.error(result.error.message);
\tprocess.exit(1);
}

process.exit(result.status ?? 1);
`;
}

function findOnPath(command: string): string | undefined {
	const pathValue = process.env.PATH;
	if (!pathValue) return undefined;
	const extensions = process.platform === "win32" ? [".exe", ""] : [""];
	for (const dir of pathValue.split(delimiter)) {
		for (const extension of extensions) {
			const candidate = join(dir, `${command}${extension}`);
			if (pathExistsSync(candidate)) return candidate;
		}
	}
	return undefined;
}

function pathExistsSync(path: string): boolean {
	try {
		accessSync(path, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

function getCurrentPlatformArchId(): string {
	return `${process.platform}-${process.arch}`;
}

function getLauncherBinaryName(): string {
	return process.platform === "win32" ? `${LAUNCHER_BINARY_BASE_NAME}.exe` : LAUNCHER_BINARY_BASE_NAME;
}

function resolveBunCommand(): string {
	const npmExecPath = process.env.npm_execpath;
	if (npmExecPath && basename(npmExecPath).toLowerCase().startsWith("bun") && pathExistsSync(npmExecPath)) {
		return npmExecPath;
	}

	const bunInstall = process.env.BUN_INSTALL;
	if (bunInstall) {
		const installedBun = join(bunInstall, "bin", process.platform === "win32" ? "bun.exe" : "bun");
		if (pathExistsSync(installedBun)) return installedBun;
	}

	const pathBun = findOnPath("bun");
	if (pathBun) return pathBun;

	return process.platform === "win32" ? "bun.exe" : "bun";
}

async function assertExecutable(path: string): Promise<void> {
	if (!(await isExecutable(path))) {
		throw new Error(`Dev CLI shim is not executable: ${path}`);
	}
}

export async function ensureDevCliShim(options: DevCliShimOptions): Promise<string> {
	const shimDir = join(options.appRoot, DEV_CLI_DIR, getCurrentPlatformArchId());
	const sourcePath = join(shimDir, LAUNCHER_SOURCE_NAME);
	const binaryPath = join(shimDir, getLauncherBinaryName());

	await mkdir(shimDir, { recursive: true });

	const sourceChanged = await writeFileIfChanged(sourcePath, createLauncherSource(options));
	if (await needsCompile(sourcePath, binaryPath, sourceChanged)) {
		const bunCommand = resolveBunCommand();
		await execFileAsync(bunCommand, ["build", sourcePath, "--compile", "--outfile", binaryPath], {
			cwd: options.appRoot,
			windowsHide: true,
		});
	}

	await assertExecutable(binaryPath);
	return binaryPath;
}
