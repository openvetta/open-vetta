import chalk from "chalk";
import { spawnSync } from "child_process";
import extractZip from "extract-zip";
import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "fs";
import { writeFile } from "fs/promises";
import { arch, platform } from "os";
import { join } from "path";
import { APP_NAME, getBinDir } from "../config.js";

export type ToolExecutableName = "fd" | "rg";

const TOOLS_DIR = getBinDir();
const NETWORK_TIMEOUT_MS = 30000;
const NETWORK_RETRY_COUNT = 2;
const NETWORK_RETRY_DELAY_MS = 1000;

function isOfflineModeEnabled(): boolean {
	const value = process.env.PI_OFFLINE;
	if (!value) return false;
	return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

interface ToolConfig {
	name: string;
	repo: string; // GitHub repo (e.g., "sharkdp/fd")
	binaryName: string; // Name of the binary inside the archive
	tagPrefix: string; // Prefix for tags (e.g., "v" for v1.0.0, "" for 1.0.0)
	getAssetName: (version: string, plat: string, architecture: string) => string | null;
}

const TOOLS: Record<string, ToolConfig> = {
	fd: {
		name: "fd",
		repo: "sharkdp/fd",
		binaryName: "fd",
		tagPrefix: "v",
		getAssetName: (version, plat, architecture) => {
			if (plat === "darwin") {
				const archStr = architecture === "arm64" ? "aarch64" : "x86_64";
				return `fd-v${version}-${archStr}-apple-darwin.tar.gz`;
			} else if (plat === "linux") {
				const archStr = architecture === "arm64" ? "aarch64" : "x86_64";
				return `fd-v${version}-${archStr}-unknown-linux-gnu.tar.gz`;
			} else if (plat === "win32") {
				const archStr = architecture === "arm64" ? "aarch64" : "x86_64";
				return `fd-v${version}-${archStr}-pc-windows-msvc.zip`;
			}
			return null;
		},
	},
	rg: {
		name: "ripgrep",
		repo: "BurntSushi/ripgrep",
		binaryName: "rg",
		tagPrefix: "",
		getAssetName: (version, plat, architecture) => {
			if (plat === "darwin") {
				const archStr = architecture === "arm64" ? "aarch64" : "x86_64";
				return `ripgrep-${version}-${archStr}-apple-darwin.tar.gz`;
			} else if (plat === "linux") {
				if (architecture === "arm64") {
					return `ripgrep-${version}-aarch64-unknown-linux-gnu.tar.gz`;
				}
				return `ripgrep-${version}-x86_64-unknown-linux-musl.tar.gz`;
			} else if (plat === "win32") {
				const archStr = architecture === "arm64" ? "aarch64" : "x86_64";
				return `ripgrep-${version}-${archStr}-pc-windows-msvc.zip`;
			}
			return null;
		},
	},
};

export interface ToolDownloadPlanOptions {
	readonly tool: ToolExecutableName;
	readonly version: string;
	readonly platform: NodeJS.Platform;
	readonly architecture: string;
	readonly toolsDirectory: string;
}

export interface ToolDownloadPlan {
	readonly assetName: string;
	readonly archivePath: string;
	readonly binaryFileName: string;
	readonly binaryPath: string;
	readonly downloadUrl: string;
}

export function createToolDownloadPlan(options: ToolDownloadPlanOptions): ToolDownloadPlan | undefined {
	const config = TOOLS[options.tool];
	if (!config) return undefined;

	const assetName = config.getAssetName(options.version, options.platform, options.architecture);
	if (!assetName) return undefined;

	const binaryFileName = `${config.binaryName}${options.platform === "win32" ? ".exe" : ""}`;
	return {
		assetName,
		archivePath: join(options.toolsDirectory, assetName),
		binaryFileName,
		binaryPath: join(options.toolsDirectory, binaryFileName),
		downloadUrl: `https://github.com/${config.repo}/releases/download/${config.tagPrefix}${options.version}/${assetName}`,
	};
}

// Check if a command exists in PATH by trying to run it
function commandExists(cmd: string): boolean {
	try {
		const result = spawnSync(cmd, ["--version"], { stdio: "pipe" });
		// Check for ENOENT error (command not found)
		return result.error === undefined || result.error === null;
	} catch {
		return false;
	}
}

// Get the path to a tool (system-wide or in our tools dir)
export function getToolPath(tool: "fd" | "rg"): string | null {
	const config = TOOLS[tool];
	if (!config) return null;

	// Check our tools directory first
	const localPath = join(TOOLS_DIR, config.binaryName + (platform() === "win32" ? ".exe" : ""));
	if (existsSync(localPath)) {
		return localPath;
	}

	// Check system PATH - if found, just return the command name (it's in PATH)
	if (commandExists(config.binaryName)) {
		return config.binaryName;
	}

	return null;
}

// Fetch latest release version from GitHub
async function getLatestVersion(repo: string): Promise<string> {
	const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
		headers: { "User-Agent": `${APP_NAME}-coding-agent` },
		signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
	});

	if (!response.ok) {
		throw new Error(`GitHub API error: ${response.status}`);
	}

	const data = (await response.json()) as { tag_name: string };
	return data.tag_name.replace(/^v/, "");
}

function isRetryableDownloadError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	// AbortSignal.timeout() produces a TimeoutError DOMException in Node.js.
	if (error.name === "TimeoutError") return true;
	// Cover common transient fetch failures.
	if (error.name === "TypeError") return true;
	return false;
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Download a file from URL
async function downloadFile(url: string, dest: string): Promise<void> {
	for (let attempt = 0; attempt <= NETWORK_RETRY_COUNT; attempt++) {
		try {
			const response = await fetch(url, {
				signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
			});

			if (!response.ok) {
				throw new Error(`Failed to download: ${response.status}`);
			}

			const bytes = await response.arrayBuffer();
			await writeFile(dest, new Uint8Array(bytes));
			return;
		} catch (error) {
			if (attempt >= NETWORK_RETRY_COUNT || !isRetryableDownloadError(error)) {
				throw error;
			}
			await wait(NETWORK_RETRY_DELAY_MS * (attempt + 1));
		}
	}
}

function findBinaryRecursively(rootDir: string, binaryFileName: string): string | null {
	const stack: string[] = [rootDir];

	while (stack.length > 0) {
		const currentDir = stack.pop();
		if (!currentDir) continue;

		const entries = readdirSync(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(currentDir, entry.name);
			if (entry.isFile() && entry.name === binaryFileName) {
				return fullPath;
			}
			if (entry.isDirectory()) {
				stack.push(fullPath);
			}
		}
	}

	return null;
}

export interface ToolArchiveOperations {
	readonly extractTarGz: (archivePath: string, extractDirectory: string, assetName: string) => void;
	readonly extractZip: (archivePath: string, extractDirectory: string) => Promise<void>;
	readonly fileExists: (path: string) => boolean;
	readonly findBinary: (rootDirectory: string, binaryFileName: string) => string | null;
	readonly moveFile: (sourcePath: string, destinationPath: string) => void;
	readonly makeExecutable: (path: string) => void;
	readonly removeFile: (path: string) => void;
	readonly removeDirectory: (path: string) => void;
}

export interface InstallToolArchiveOptions {
	readonly plan: ToolDownloadPlan;
	readonly extractDirectory: string;
	readonly platform: NodeJS.Platform;
	readonly operations: ToolArchiveOperations;
}

export async function installToolArchive(options: InstallToolArchiveOptions): Promise<string> {
	const { plan, extractDirectory, operations } = options;

	try {
		if (plan.assetName.endsWith(".tar.gz")) {
			operations.extractTarGz(plan.archivePath, extractDirectory, plan.assetName);
		} else if (plan.assetName.endsWith(".zip")) {
			await operations.extractZip(plan.archivePath, extractDirectory);
		} else {
			throw new Error(`Unsupported archive format: ${plan.assetName}`);
		}

		const extractedDirectory = join(extractDirectory, plan.assetName.replace(/\.(tar\.gz|zip)$/, ""));
		const extractedBinaryCandidates = [
			join(extractedDirectory, plan.binaryFileName),
			join(extractDirectory, plan.binaryFileName),
		];
		let extractedBinary = extractedBinaryCandidates.find((candidate) => operations.fileExists(candidate));

		if (!extractedBinary) {
			extractedBinary = operations.findBinary(extractDirectory, plan.binaryFileName) ?? undefined;
		}

		if (extractedBinary) {
			operations.moveFile(extractedBinary, plan.binaryPath);
		} else {
			throw new Error(`Binary not found in archive: expected ${plan.binaryFileName} under ${extractDirectory}`);
		}

		if (options.platform !== "win32") {
			operations.makeExecutable(plan.binaryPath);
		}
	} finally {
		operations.removeFile(plan.archivePath);
		operations.removeDirectory(extractDirectory);
	}

	return plan.binaryPath;
}

const defaultToolArchiveOperations: ToolArchiveOperations = {
	extractTarGz: (archivePath, extractDirectory, assetName) => {
		const extractResult = spawnSync("tar", ["xzf", archivePath, "-C", extractDirectory], { stdio: "pipe" });
		if (extractResult.error || extractResult.status !== 0) {
			const errMsg = extractResult.error?.message ?? extractResult.stderr?.toString().trim() ?? "unknown error";
			throw new Error(`Failed to extract ${assetName}: ${errMsg}`);
		}
	},
	extractZip: (archivePath, extractDirectory) => extractZip(archivePath, { dir: extractDirectory }),
	fileExists: existsSync,
	findBinary: findBinaryRecursively,
	moveFile: renameSync,
	makeExecutable: (path) => chmodSync(path, 0o755),
	removeFile: (path) => rmSync(path, { force: true }),
	removeDirectory: (path) => rmSync(path, { recursive: true, force: true }),
};

// Download and install a tool
async function downloadTool(tool: "fd" | "rg"): Promise<string> {
	const config = TOOLS[tool];
	if (!config) throw new Error(`Unknown tool: ${tool}`);

	const plat = platform();
	const architecture = arch();

	// Get latest version
	const version = await getLatestVersion(config.repo);

	// Get asset name for this platform
	const plan = createToolDownloadPlan({
		tool,
		version,
		platform: plat,
		architecture,
		toolsDirectory: TOOLS_DIR,
	});
	if (!plan) {
		throw new Error(`Unsupported platform: ${plat}/${architecture}`);
	}

	// Create tools directory
	mkdirSync(TOOLS_DIR, { recursive: true });

	// Download
	await downloadFile(plan.downloadUrl, plan.archivePath);

	// Extract into a unique temp directory. fd and rg downloads can run concurrently
	// during startup, so sharing a fixed directory causes races.
	const extractDir = join(
		TOOLS_DIR,
		`extract_tmp_${config.binaryName}_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
	);
	mkdirSync(extractDir, { recursive: true });

	return installToolArchive({
		plan,
		extractDirectory: extractDir,
		platform: plat,
		operations: defaultToolArchiveOperations,
	});
}

// Termux package names for tools
const TERMUX_PACKAGES: Record<string, string> = {
	fd: "fd",
	rg: "ripgrep",
};

export interface EnsureToolDependencies {
	readonly getPath: (tool: ToolExecutableName) => string | null;
	readonly isOffline: () => boolean;
	readonly platform: () => string;
	readonly download: (tool: ToolExecutableName) => Promise<string>;
}

// Ensure a tool is available, downloading if necessary
// Returns the path to the tool, or null if unavailable
export async function ensureToolWithDependencies(
	tool: ToolExecutableName,
	silent: boolean,
	dependencies: EnsureToolDependencies,
): Promise<string | undefined> {
	const existingPath = dependencies.getPath(tool);
	if (existingPath) {
		return existingPath;
	}

	const config = TOOLS[tool];
	if (!config) return undefined;

	if (dependencies.isOffline()) {
		if (!silent) {
			console.log(chalk.yellow(`${config.name} not found. Offline mode enabled, skipping download.`));
		}
		return undefined;
	}

	// On Android/Termux, Linux binaries don't work due to Bionic libc incompatibility.
	// Users must install via pkg.
	if (dependencies.platform() === "android") {
		const pkgName = TERMUX_PACKAGES[tool] ?? tool;
		if (!silent) {
			console.log(chalk.yellow(`${config.name} not found. Install with: pkg install ${pkgName}`));
		}
		return undefined;
	}

	// Tool not found - download it
	if (!silent) {
		console.log(chalk.dim(`${config.name} not found. Downloading...`));
	}

	try {
		const path = await dependencies.download(tool);
		if (!silent) {
			console.log(chalk.dim(`${config.name} installed to ${path}`));
		}
		return path;
	} catch (e) {
		if (!silent) {
			console.log(chalk.yellow(`Failed to download ${config.name}: ${e instanceof Error ? e.message : e}`));
		}
		return undefined;
	}
}

const defaultEnsureToolDependencies: EnsureToolDependencies = {
	getPath: getToolPath,
	isOffline: isOfflineModeEnabled,
	platform,
	download: downloadTool,
};

export async function ensureTool(tool: ToolExecutableName, silent: boolean = false): Promise<string | undefined> {
	return ensureToolWithDependencies(tool, silent, defaultEnsureToolDependencies);
}
