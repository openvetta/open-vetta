import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { chmod, cp } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { getAppLogger } from "../logger.js";
import { atomicWriteJSON } from "../utils/atomic-write.js";
import {
	binDirsFor,
	executablePathFor,
	installDir,
	npmCacheDir,
	npmGlobalBinDir,
	npmGlobalPrefixDir,
	platformEntry,
	RUNTIME_MANIFEST,
	type RuntimeType,
	registryPath,
	runtimesDir,
	runtimeVersion,
	vendorRuntimeDir,
} from "./paths.js";
import type { RuntimeRegistryData, RuntimeStatus, RuntimesStatus } from "./types.js";

const log = getAppLogger("runtimes");

// 在任何 PATH 注入之前抓一份系统 PATH 快照，用于探测「真正的系统运行时」——
// 否则 applyEnv() 之后再探测会把我们自己注入的托管版当成系统版。
const SYSTEM_PATH_SNAPSHOT = process.env.PATH ?? process.env.Path ?? "";

const RUNTIME_TYPES: RuntimeType[] = ["node", "python"];

function emptyRegistry(): RuntimeRegistryData {
	return { version: 1, binaries: {}, systemDetection: {} };
}

/** 解析版本号:node `v22.20.0`→`22.20.0`;python `Python 3.13.9`→`3.13.9`。 */
function parseVersion(raw: string): string | undefined {
	const m = raw.match(/(\d+\.\d+\.\d+)/);
	return m?.[1];
}

export class RuntimeManager {
	private data: RuntimeRegistryData = emptyRegistry();

	private loadRegistry(): void {
		try {
			if (existsSync(registryPath())) {
				const parsed = JSON.parse(readFileSync(registryPath(), "utf-8")) as RuntimeRegistryData;
				if (parsed && parsed.version === 1) {
					this.data = {
						version: 1,
						binaries: parsed.binaries ?? {},
						systemDetection: parsed.systemDetection ?? {},
					};
				}
			}
		} catch (err) {
			log.warn("registry load failed, starting fresh", err);
			this.data = emptyRegistry();
		}
	}

	private saveRegistry(): void {
		try {
			atomicWriteJSON(registryPath(), this.data);
		} catch (err) {
			log.warn("registry save failed", err);
		}
	}

	/** 探测系统已安装的同名运行时(用系统 PATH 快照,不含我们的注入)。 */
	private detectSystem(type: RuntimeType): void {
		const candidates = type === "python" ? ["python3", "python"] : ["node"];
		const env = { ...process.env, PATH: SYSTEM_PATH_SNAPSHOT, Path: SYSTEM_PATH_SNAPSHOT };
		for (const cmd of candidates) {
			try {
				const res = spawnSync(cmd, ["--version"], { encoding: "utf-8", timeout: 5000, env });
				if (res.status === 0) {
					const version = parseVersion(`${res.stdout}${res.stderr}`);
					const whichRes = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], {
						encoding: "utf-8",
						timeout: 5000,
						env,
					});
					const path = whichRes.stdout?.trim().split(/\r?\n/)[0];
					if (version && path && existsSync(path)) {
						this.data.systemDetection[type] = { path, version, detectedAt: Date.now() };
						return;
					}
				}
			} catch {
				// 继续尝试下一个候选名
			}
		}
		delete this.data.systemDetection[type];
	}

	/** 内置 vendor → ~/.vetta/runtimes 首启拷贝。返回是否完成 seed。 */
	private async seedFromVendor(type: RuntimeType): Promise<boolean> {
		const entry = platformEntry(type);
		if (!entry) return false;
		const version = runtimeVersion(type);
		const source = vendorRuntimeDir(type);
		if (!existsSync(source)) return false;

		const target = installDir(type, version);
		const marker = join(target, ".vendor-version");
		if (existsSync(executablePathFor(type, version)) && this.readMarker(marker) === version) {
			return true; // 已 seed 且版本一致,跳过拷贝
		}

		log.info(`seeding ${type} ${version} from vendor`, { source, target });
		rmSync(target, { recursive: true, force: true });
		mkdirSync(target, { recursive: true });
		await cp(source, target, { recursive: true });
		await this.makeExecutable(type, version);
		writeFileSync(marker, version);
		return true;
	}

	private readMarker(path: string): string | undefined {
		try {
			return existsSync(path) ? readFileSync(path, "utf-8").trim() : undefined;
		} catch {
			return undefined;
		}
	}

	private async makeExecutable(type: RuntimeType, version: string): Promise<void> {
		if (process.platform === "win32") return;
		const exe = executablePathFor(type, version);
		try {
			if (existsSync(exe)) await chmod(exe, 0o755);
		} catch {
			// best-effort
		}
	}

	/**
	 * 下载兜底(升级 / 无内置 vendor 时)。从 sources 列表逐个尝试,解压到安装目录。
	 * 这是次要路径——首启主路径是 seedFromVendor。无网络时会失败,由调用方容错。
	 */
	private async download(type: RuntimeType): Promise<boolean> {
		const entry = platformEntry(type);
		if (!entry) return false;
		const def = RUNTIME_MANIFEST[type];
		const version = def.version;
		const release = type === "python" ? RUNTIME_MANIFEST.python.release : "";
		const urls = def.sources.map((tpl) =>
			tpl.replace("{version}", version).replace("{release}", release).replace("{filename}", entry.filename),
		);

		const tmpFile = join(runtimesDir(), ".cache", `${type}-${version}-${entry.filename}`);
		mkdirSync(join(runtimesDir(), ".cache"), { recursive: true });
		for (const url of urls) {
			try {
				log.info(`downloading ${type} from ${url}`);
				await this.fetchToFile(url, tmpFile);
				const extractRoot = join(runtimesDir(), ".cache", `${type}-extract`);
				rmSync(extractRoot, { recursive: true, force: true });
				mkdirSync(extractRoot, { recursive: true });
				this.extractArchive(tmpFile, extractRoot, entry.archive);
				const inner = join(extractRoot, entry.dir);
				const target = installDir(type, version);
				rmSync(target, { recursive: true, force: true });
				mkdirSync(join(runtimesDir(), type), { recursive: true });
				await cp(inner, target, { recursive: true });
				await this.makeExecutable(type, version);
				writeFileSync(join(target, ".vendor-version"), version);
				rmSync(tmpFile, { force: true });
				rmSync(extractRoot, { recursive: true, force: true });
				return true;
			} catch (err) {
				log.warn(`download from ${url} failed`, err);
			}
		}
		return false;
	}

	private async fetchToFile(url: string, dest: string): Promise<void> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 180_000);
		try {
			const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
		} finally {
			clearTimeout(timer);
		}
	}

	private extractArchive(file: string, destDir: string, _archive: "tar.gz" | "zip"): void {
		// 统一用系统 tar:Win10+ 的 bsdtar 能解 zip,unix tar 解 tar.gz。
		const res = spawnSync("tar", ["-xf", file, "-C", destDir], { encoding: "utf-8", timeout: 180_000 });
		if (res.status !== 0) {
			throw new Error(`tar extract failed: ${res.stderr || res.stdout || res.error?.message}`);
		}
	}

	private isReady(type: RuntimeType): boolean {
		return existsSync(executablePathFor(type));
	}

	private recordManaged(type: RuntimeType): void {
		const version = runtimeVersion(type);
		this.data.binaries[type] = {
			source: "managed",
			version,
			executablePath: executablePathFor(type, version),
			installPath: installDir(type, version),
			installedAt: Date.now(),
			verified: true,
		};
	}

	/** 探测系统 + 首启 seed(失败回退下载)。不抛错:任一运行时失败不阻断启动。 */
	async initialize(): Promise<void> {
		this.loadRegistry();
		for (const type of RUNTIME_TYPES) {
			try {
				this.detectSystem(type);
			} catch (err) {
				log.warn(`detect system ${type} failed`, err);
			}
			try {
				// 启动只走零网络的 vendor 拷贝;下载是面板触发的次要路径(见 reinstall),
				// 不在启动阻塞,避免无内置 vendor 的开发态/异常环境卡在 180s 超时。
				if (!this.isReady(type)) {
					await this.seedFromVendor(type);
				}
				if (this.isReady(type)) {
					this.recordManaged(type);
				} else {
					delete this.data.binaries[type];
					log.warn(`${type} not ready (vendor absent); deferring to panel-driven download`);
				}
			} catch (err) {
				log.error(`ensure ${type} failed`, err);
			}
		}
		this.saveRegistry();
	}

	/**
	 * 把托管运行时注入全局 process.env(ADR-0011 / A1)。一处生效:桌面 in-process
	 * bash 经 getShellEnv() spread、IM sidecar 继承 main env → coding-agent → bash。
	 * 幂等:重复调用安全。即使运行时未就绪也安全(前置不存在目录无害)。
	 */
	applyEnv(): void {
		const dirs: string[] = [];
		for (const type of RUNTIME_TYPES) {
			if (this.isReady(type)) dirs.push(...binDirsFor(type));
		}
		dirs.push(npmGlobalBinDir());

		const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === "path") ?? "PATH";
		const existing = (process.env[pathKey] ?? "").split(delimiter).filter(Boolean);
		const merged = [...dirs.filter((d) => !existing.includes(d)), ...existing];
		process.env[pathKey] = merged.join(delimiter);

		process.env.npm_config_registry = RUNTIME_MANIFEST.mirrors.npmRegistry;
		process.env.npm_config_prefix = npmGlobalPrefixDir();
		process.env.npm_config_cache = npmCacheDir();
		process.env.PIP_INDEX_URL = RUNTIME_MANIFEST.mirrors.pipIndexUrl;
		process.env.PIP_TRUSTED_HOST = RUNTIME_MANIFEST.mirrors.pipTrustedHost;

		// 确保 npm 全局前缀目录存在,否则首个 `npm i -g` 会因 prefix 不存在报错。
		try {
			mkdirSync(npmGlobalBinDir(), { recursive: true });
			mkdirSync(npmCacheDir(), { recursive: true });
		} catch {
			// best-effort
		}

		log.info("runtime env applied", {
			node: this.isReady("node"),
			python: this.isReady("python"),
			npmRegistry: RUNTIME_MANIFEST.mirrors.npmRegistry,
		});
	}

	private statusFor(type: RuntimeType): RuntimeStatus {
		const entry = platformEntry(type);
		const ready = this.isReady(type);
		const system = this.data.systemDetection[type];
		return {
			type,
			ready,
			recommendedVersion: runtimeVersion(type),
			managedVersion: ready ? runtimeVersion(type) : undefined,
			executablePath: ready ? executablePathFor(type) : undefined,
			activeSource: "managed",
			system: system ? { path: system.path, version: system.version } : undefined,
			supported: Boolean(entry),
		};
	}

	getStatus(): RuntimesStatus {
		return {
			node: this.statusFor("node"),
			python: this.statusFor("python"),
			mirrors: {
				npmRegistry: RUNTIME_MANIFEST.mirrors.npmRegistry,
				pipIndexUrl: RUNTIME_MANIFEST.mirrors.pipIndexUrl,
			},
		};
	}

	/** 面板「升级/重新获取」:强制重新 seed/下载推荐版本,再刷新 env。 */
	async reinstall(type: RuntimeType): Promise<RuntimeStatus> {
		const target = installDir(type);
		rmSync(join(target, ".vendor-version"), { force: true });
		const seeded = await this.seedFromVendor(type);
		if (!seeded) await this.download(type);
		if (this.isReady(type)) this.recordManaged(type);
		this.saveRegistry();
		this.applyEnv();
		return this.statusFor(type);
	}

	/** 面板「重新探测系统运行时」。 */
	redetect(): RuntimesStatus {
		for (const type of RUNTIME_TYPES) this.detectSystem(type);
		this.saveRegistry();
		return this.getStatus();
	}
}

let shared: RuntimeManager | null = null;

export function getRuntimeManager(): RuntimeManager {
	if (!shared) shared = new RuntimeManager();
	return shared;
}
