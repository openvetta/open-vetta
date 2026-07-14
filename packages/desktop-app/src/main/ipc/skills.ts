import { execSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";
import { DefaultResourceLoader } from "@vetta/coding-agent";
import AdmZip from "adm-zip";
import { ipcMain } from "electron";
import type { AppMonitorResourceOperation } from "../../preload/api-types/app-monitor.js";
import { recordAppMonitorEvent } from "../app-monitor/app-monitor-service.js";
import { buildAgentPluginRuntimeConfig } from "../plugins/plugin-store.js";
import { allowProjectRoot, readDesktopConfig } from "./fs.js";

function assertNonEmptyString(value: unknown, fieldName: string): asserts value is string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Invalid ${fieldName}`);
	}
}

const skillsBaseDir = join(getVettaHomePath(), "skills");
const sceneBaseDir = join(getVettaHomePath(), "scene");
const manifestPath = join(getVettaHomePath(), "skills-manifest.json");
const tmpBaseDir = join(getVettaHomePath(), "tmp");

function getBaseDir(type: "skill" | "scene"): string {
	return type === "scene" ? sceneBaseDir : skillsBaseDir;
}

function recordSkillResourceEvent(input: {
	name: string;
	type: "skill" | "scene";
	source?: "market" | "custom";
	operation: AppMonitorResourceOperation;
}): void {
	try {
		recordAppMonitorEvent({
			type: "resource.lifecycle",
			resourceKind: input.type,
			operation: input.operation,
			resourceId: input.name,
			...(input.source ? { source: input.source } : {}),
		});
	} catch {
		// Monitoring must not affect skill operations.
	}
}

interface InstalledMarketSkill {
	name: string;
	version: string;
	installedAt: string;
	source: "market";
	enabled: boolean;
	type?: "skill" | "scene";
	alias?: string;
	marketDescription?: string;
}

interface InstalledCustomSkill {
	name: string;
	version: string;
	installedAt: string;
	source: "custom";
	enabled: boolean;
	type: "skill";
	alias?: string;
	description: string;
}

type InstalledSkill = InstalledMarketSkill | InstalledCustomSkill;

export function readSkillsManifest(): Record<string, InstalledSkill> {
	return readManifest();
}

function readManifest(): Record<string, InstalledSkill> {
	if (!existsSync(manifestPath)) return {};
	try {
		const raw = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, InstalledSkill>;
		// Backward compat: entries without `enabled` default to true
		for (const entry of Object.values(raw)) {
			if (entry.enabled === undefined) {
				entry.enabled = true;
			}
		}
		return raw;
	} catch {
		return {};
	}
}

function writeManifest(manifest: Record<string, InstalledSkill>): void {
	const dir = dirname(manifestPath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
}

interface SkillFrontmatter {
	name?: string;
	alias?: string;
	description?: string;
	version?: string;
}

function extractFrontmatter(content: string): string | null {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	return match ? match[1] : null;
}

function unquote(value: string): string {
	const trimmed = value.trim();
	if (trimmed.length >= 2) {
		const first = trimmed[0];
		const last = trimmed[trimmed.length - 1];
		if ((first === '"' || first === "'") && first === last) {
			return trimmed.slice(1, -1);
		}
	}
	return trimmed;
}

function parseFrontmatter(content: string): SkillFrontmatter {
	const fm = extractFrontmatter(content);
	if (!fm) return {};
	const result: SkillFrontmatter = {};
	const lines = fm.split(/\r?\n/);
	for (const line of lines) {
		const topMatch = line.match(/^(name|alias|description):\s*(.*)$/);
		if (topMatch) {
			const key = topMatch[1] as "name" | "alias" | "description";
			const value = unquote(topMatch[2]);
			if (value.length > 0) result[key] = value;
		}
	}
	const versionMatch = fm.match(/version:\s*["']?([^\s"']+)["']?/i);
	if (versionMatch) result.version = versionMatch[1];
	return result;
}

function yamlDoubleQuote(value: string): string {
	const escaped = value
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\r/g, "\\r")
		.replace(/\n/g, "\\n")
		.replace(/\t/g, "\\t");
	return `"${escaped}"`;
}

/**
 * 把 frontmatter 中 description 字段重写为 double-quoted YAML 字符串，
 * 防止 description 包含 `:` 等字符时 YAML 解析失败（agent 用的是严格 YAML 解析器）。
 * 仅替换单行 description；其他字段原样保留。
 */
function rewriteFrontmatterDescription(content: string, description: string): string {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return content;
	const original = match[0];
	const body = match[1];
	const replaced = body.replace(/^description:[ \t]*.*$/m, `description: ${yamlDoubleQuote(description)}`);
	if (replaced === body) return content;
	const eolMatch = original.match(/\r?\n/);
	const eol = eolMatch ? eolMatch[0] : "\n";
	return content.replace(original, `---${eol}${replaced}${eol}---`);
}

function findShallowestSkillMd(rootDir: string): string | null {
	const holder: { best: { path: string; depth: number } | null } = { best: null };
	const walk = (dir: string, depth: number): void => {
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = join(dir, entry);
			let st: ReturnType<typeof statSync>;
			try {
				st = statSync(full);
			} catch {
				continue;
			}
			if (st.isFile() && entry === "SKILL.md") {
				if (!holder.best || depth < holder.best.depth) holder.best = { path: full, depth };
			} else if (st.isDirectory()) {
				walk(full, depth + 1);
			}
		}
	};
	walk(rootDir, 0);
	return holder.best?.path ?? null;
}

// 历史版本曾把临时 tar 写入 baseDir 内，少数环境下 baseDir 的写权限被破坏后会卡死后续安装/卸载。
// 这里在每次写操作前主动给目录补上 u+w，做一次自愈。仅修复缺失的 owner 写权限，不放宽其他位。
function ensureDirWritable(dir: string): void {
	if (!existsSync(dir)) return;
	try {
		const mode = statSync(dir).mode & 0o777;
		if ((mode & 0o200) === 0) {
			chmodSync(dir, mode | 0o200);
		}
	} catch {
		// 权限修复失败时，让后续真正的写操作抛出更具体的错误
	}
}

function parseVersionFromSkillDir(skillDir: string): string {
	const skillMdPath = join(skillDir, "SKILL.md");
	if (!existsSync(skillMdPath)) return "0.0.0";
	try {
		const content = readFileSync(skillMdPath, "utf-8");
		const versionMatch = content.match(/version:\s*["']?([^\s"']+)["']?/i);
		return versionMatch?.[1] ?? "0.0.0";
	} catch {
		return "0.0.0";
	}
}

export interface ListedSkill {
	name: string;
	alias?: string;
	description?: string;
	source: string;
	type?: string;
}

export async function listSkills(cwd?: string): Promise<ListedSkill[]> {
	// 适配通用 Agent Skill：跟随「Agent配置 → 扩展功能」开关，关闭时不发现 .agents/skills。
	const desktopConfig = await readDesktopConfig();
	const includeAgentSkills = desktopConfig.experimental?.agentSkills !== false;
	// Plugin-packaged skills (agent.skillPaths) must appear in slash "/" the same way
	// they are injected into agent sessions via skillPathContributions.
	const pluginSkillPaths =
		buildAgentPluginRuntimeConfig()?.skillPathContributions?.flatMap((contribution) => contribution.paths) ?? [];
	// 传入当前会话/项目 cwd，才能发现项目级 <cwd>/.agents/skills 与 <cwd>/.vetta/skills；
	// 不传则只列全局来源（主进程自身 cwd 下通常无项目目录）。
	const loader = new DefaultResourceLoader({
		includeAgentSkills,
		cwd,
		additionalSkillPaths: pluginSkillPaths,
	});
	await loader.reload();
	const { skills } = loader.getSkills();
	const manifest = readManifest();
	// Absolute plugin skill roots — used to label source as "plugin" in the slash list.
	const pluginRoots = pluginSkillPaths.map((p) => p.replace(/[/\\]+$/, ""));
	const isUnderPluginRoot = (filePath: string): boolean => {
		const normalized = filePath.replace(/\\/g, "/");
		return pluginRoots.some((root) => {
			const r = root.replace(/\\/g, "/");
			return normalized === r || normalized.startsWith(`${r}/`);
		});
	};
	return skills
		.filter((s) => {
			const entry = manifest[s.name];
			// market 来源的 skill/scene 必须在 manifest 中且已启用
			if (s.source === "market" || s.source === "scene") {
				return entry?.enabled ?? false;
			}
			// 其余来源（user/project/path/agents-* / plugin）默认显示
			return !entry || entry.enabled;
		})
		.map((s) => {
			const entry = manifest[s.name];
			const source = isUnderPluginRoot(s.filePath) ? "plugin" : s.source;
			return {
				name: s.name,
				alias: s.alias || entry?.alias,
				description: (entry?.source === "market" ? entry.marketDescription : undefined) || s.description,
				source,
				type: s.type,
			};
		});
}

export function setSkillEnabled(name: string, enabled: boolean): { name: string; enabled: boolean } {
	const manifest = readManifest();
	const entry = manifest[name];
	if (!entry) {
		throw new Error(`Skill "${name}" is not installed`);
	}
	if (entry.enabled !== enabled) {
		entry.enabled = enabled;
		writeManifest(manifest);
		recordSkillResourceEvent({
			name,
			type: entry.type === "scene" ? "scene" : "skill",
			source: entry.source,
			operation: enabled ? "enabled" : "disabled",
		});
	}
	return { name, enabled: entry.enabled };
}

export function toggleSkill(name: string): { name: string; enabled: boolean } {
	const manifest = readManifest();
	const entry = manifest[name];
	if (!entry) {
		throw new Error(`Skill "${name}" is not installed`);
	}
	return setSkillEnabled(name, !entry.enabled);
}

export async function uninstallSkill(name: string, type?: "skill" | "scene"): Promise<void> {
	const manifest = readManifest();
	const itemType: "skill" | "scene" =
		type === "scene" ? "scene" : type === "skill" ? "skill" : manifest[name]?.type === "scene" ? "scene" : "skill";

	const baseDir = getBaseDir(itemType);
	ensureDirWritable(baseDir);
	const skillDir = join(baseDir, name);
	const previous = manifest[name];
	if (existsSync(skillDir)) {
		ensureDirWritable(skillDir);
		await rm(skillDir, { recursive: true, force: true });
	}

	delete manifest[name];
	writeManifest(manifest);
	recordSkillResourceEvent({
		name,
		type: itemType,
		source: previous?.source,
		operation: "uninstalled",
	});
}

export function registerSkillsIpc(): () => void {
	// 允许通用 fs IPC 读取技能 / 场景目录下的文件（用于 SKILL.md 预览等）
	allowProjectRoot(skillsBaseDir);
	allowProjectRoot(sceneBaseDir);
	// 通用 Agent Skill（只读）预览：放行全局 ~/.agents/skills。
	allowProjectRoot(join(homedir(), ".agents", "skills"));

	ipcMain.handle("vetta:skills:list", async (_event, cwd: unknown) => {
		const resolvedCwd = typeof cwd === "string" && cwd.trim().length > 0 ? cwd : undefined;
		// Plugin skill packages live under system-plugins / ~/.vetta/plugins; allow
		// roots so slash/detail previews can read SKILL.md via fs IPC if needed.
		const pluginSkillPaths = buildAgentPluginRuntimeConfig()?.skillPathContributions?.flatMap((c) => c.paths) ?? [];
		for (const root of pluginSkillPaths) {
			try {
				allowProjectRoot(root);
			} catch {
				// ignore invalid roots
			}
		}
		return listSkills(resolvedCwd);
	});

	ipcMain.handle(
		"vetta:skills:install-from-market",
		async (_event, name: unknown, archiveBuffer: unknown, type: unknown, meta: unknown) => {
			assertNonEmptyString(name, "name");
			if (!(archiveBuffer instanceof ArrayBuffer) && !Buffer.isBuffer(archiveBuffer)) {
				throw new Error("Invalid archive buffer");
			}
			const itemType: "skill" | "scene" = type === "scene" ? "scene" : "skill";
			const metaObj = (meta != null && typeof meta === "object" ? meta : {}) as {
				alias?: string;
				marketDescription?: string;
				version?: string;
			};

			const buffer = Buffer.isBuffer(archiveBuffer) ? archiveBuffer : Buffer.from(archiveBuffer as ArrayBuffer);

			const baseDir = getBaseDir(itemType);
			if (!existsSync(baseDir)) {
				await mkdir(baseDir, { recursive: true });
			}
			ensureDirWritable(baseDir);

			const skillDir = join(baseDir, name);
			if (!existsSync(skillDir)) {
				await mkdir(skillDir, { recursive: true });
			}
			ensureDirWritable(skillDir);

			await mkdir(tmpBaseDir, { recursive: true });
			const tmpFile = join(tmpBaseDir, `_install_${name}_${Date.now()}.tar.gz`);
			try {
				await writeFile(tmpFile, buffer);
				execSync(`tar -xzf "${tmpFile}" -C "${skillDir}"`, { timeout: 30000 });
			} finally {
				try {
					await rm(tmpFile, { force: true });
				} catch {
					// ignore cleanup errors
				}
			}

			// 版本以服务端为唯一真相：优先用 meta.version；缺省才回落到本地解析（兼容旧客户端）。
			// 避免「服务端默认版本与本地解析默认值不一致 → 永远显示可更新」的问题。
			const version =
				typeof metaObj.version === "string" && metaObj.version.trim().length > 0
					? metaObj.version.trim()
					: parseVersionFromSkillDir(skillDir);

			const manifest = readManifest();
			const previous = manifest[name];
			manifest[name] = {
				name,
				version,
				installedAt: new Date().toISOString(),
				source: "market",
				enabled: true,
				type: itemType,
				alias: metaObj.alias,
				marketDescription: metaObj.marketDescription,
			};
			writeManifest(manifest);
			recordSkillResourceEvent({
				name,
				type: itemType,
				source: "market",
				operation: previous ? "updated" : "installed",
			});
		},
	);

	ipcMain.handle("vetta:skills:uninstall", async (_event, name: unknown, type: unknown) => {
		assertNonEmptyString(name, "name");
		await uninstallSkill(name, type === "scene" ? "scene" : type === "skill" ? "skill" : undefined);
	});

	ipcMain.handle("vetta:skills:toggle", async (_event, name: unknown) => {
		assertNonEmptyString(name, "name");
		return toggleSkill(name);
	});

	ipcMain.handle("vetta:skills:get-market-manifest", async () => {
		return readSkillsManifest();
	});

	ipcMain.handle("vetta:skills:get-skill-md-path", async (_event, name: unknown, type: unknown) => {
		assertNonEmptyString(name, "name");
		const itemType: "skill" | "scene" = type === "scene" ? "scene" : "skill";
		const skillMd = join(getBaseDir(itemType), name, "SKILL.md");
		if (existsSync(skillMd)) {
			return skillMd;
		}
		// 通用 Agent Skill（只读）预览：回退到全局 ~/.agents/skills/<name>/SKILL.md。
		const agentSkillMd = join(homedir(), ".agents", "skills", name, "SKILL.md");
		if (existsSync(agentSkillMd)) {
			return agentSkillMd;
		}
		throw new Error(`SKILL.md 不存在：${skillMd}`);
	});

	ipcMain.handle("vetta:skills:import-custom", async (_event, archiveBuffer: unknown) => {
		if (!(archiveBuffer instanceof ArrayBuffer) && !Buffer.isBuffer(archiveBuffer)) {
			throw new Error("Invalid archive buffer");
		}
		const buffer = Buffer.isBuffer(archiveBuffer) ? archiveBuffer : Buffer.from(archiveBuffer as ArrayBuffer);
		if (buffer.length < 2) throw new Error("压缩包内容为空或格式无效");

		await mkdir(tmpBaseDir, { recursive: true });
		const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		const extractDir = join(tmpBaseDir, `_import_${stamp}`);
		await mkdir(extractDir, { recursive: true });

		try {
			const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
			const isGzip = buffer[0] === 0x1f && buffer[1] === 0x8b;

			if (isZip) {
				const zip = new AdmZip(buffer);
				zip.extractAllTo(extractDir, true);
			} else if (isGzip) {
				const tmpFile = join(tmpBaseDir, `_import_${stamp}.tar.gz`);
				try {
					await writeFile(tmpFile, buffer);
					execSync(`tar -xzf "${tmpFile}" -C "${extractDir}"`, { timeout: 30000 });
				} finally {
					await rm(tmpFile, { force: true }).catch(() => {});
				}
			} else {
				throw new Error("仅支持 .zip 或 .tar.gz / .tgz 格式");
			}

			const skillMdPath = findShallowestSkillMd(extractDir);
			if (!skillMdPath) throw new Error("压缩包中未找到 SKILL.md");

			const fm = parseFrontmatter(readFileSync(skillMdPath, "utf-8"));
			if (!fm.name) throw new Error("SKILL.md frontmatter 缺少 name 字段");
			if (!fm.description) throw new Error("SKILL.md frontmatter 缺少 description 字段");
			if (!/^[a-z0-9-]{1,64}$/.test(fm.name)) {
				throw new Error("name 仅允许小写字母、数字、连字符（1–64 字符）");
			}

			const targetDir = join(skillsBaseDir, fm.name);
			const manifest = readManifest();
			if (manifest[fm.name] || existsSync(targetDir)) {
				throw new Error(`已存在同名技能：${fm.name}`);
			}

			await mkdir(skillsBaseDir, { recursive: true });
			cpSync(dirname(skillMdPath), targetDir, { recursive: true });

			// 规范化落盘后的 SKILL.md：将 description 重写为 double-quoted，避免内含 `:` 等字符
			// 触发 agent 端 YAML 解析失败导致技能加载不出来。
			try {
				const targetSkillMd = join(targetDir, "SKILL.md");
				const original = readFileSync(targetSkillMd, "utf-8");
				const normalized = rewriteFrontmatterDescription(original, fm.description);
				if (normalized !== original) {
					writeFileSync(targetSkillMd, normalized, "utf-8");
				}
			} catch {
				// 规范化失败不阻塞导入，保留原始文件
			}

			manifest[fm.name] = {
				name: fm.name,
				version: fm.version || "0.0.0",
				installedAt: new Date().toISOString(),
				source: "custom",
				enabled: true,
				type: "skill",
				alias: fm.alias,
				description: fm.description,
			};
			writeManifest(manifest);
			recordSkillResourceEvent({
				name: fm.name,
				type: "skill",
				source: "custom",
				operation: "imported",
			});

			return { name: fm.name };
		} finally {
			await rm(extractDir, { recursive: true, force: true }).catch(() => {});
		}
	});

	return () => {
		ipcMain.removeHandler("vetta:skills:list");
		ipcMain.removeHandler("vetta:skills:install-from-market");
		ipcMain.removeHandler("vetta:skills:uninstall");
		ipcMain.removeHandler("vetta:skills:toggle");
		ipcMain.removeHandler("vetta:skills:get-market-manifest");
		ipcMain.removeHandler("vetta:skills:get-skill-md-path");
		ipcMain.removeHandler("vetta:skills:import-custom");
	};
}
