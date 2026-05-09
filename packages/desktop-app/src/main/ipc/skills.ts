import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DefaultResourceLoader } from "@vetta/coding-agent";
import AdmZip from "adm-zip";
import { ipcMain } from "electron";
import { allowProjectRoot } from "./fs.js";

function assertNonEmptyString(value: unknown, fieldName: string): asserts value is string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Invalid ${fieldName}`);
	}
}

const skillsBaseDir = join(homedir(), ".vetta", "skills");
const sceneBaseDir = join(homedir(), ".vetta", "scene");
const manifestPath = join(homedir(), ".vetta", "skills-manifest.json");
const tmpBaseDir = join(homedir(), ".vetta", "tmp");

function getBaseDir(type: "skill" | "scene"): string {
	return type === "scene" ? sceneBaseDir : skillsBaseDir;
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

function findShallowestSkillMd(rootDir: string): string | null {
	let best: { path: string; depth: number } | null = null;
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
				if (!best || depth < best.depth) best = { path: full, depth };
			} else if (st.isDirectory()) {
				walk(full, depth + 1);
			}
		}
	};
	walk(rootDir, 0);
	return best?.path ?? null;
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

export function registerSkillsIpc(): () => void {
	// 允许通用 fs IPC 读取技能 / 场景目录下的文件（用于 SKILL.md 预览等）
	allowProjectRoot(skillsBaseDir);
	allowProjectRoot(sceneBaseDir);

	ipcMain.handle("vetta:skills:list", async () => {
		const loader = new DefaultResourceLoader({});
		await loader.reload();
		const { skills } = loader.getSkills();
		const manifest = readManifest();
		return skills
			.filter((s) => {
				const entry = manifest[s.name];
				// market 来源的 skill/scene 必须在 manifest 中且已启用
				if (s.source === "market" || s.source === "scene") {
					return entry?.enabled ?? false;
				}
				// 其余来源（user/project/path）默认显示
				return !entry || entry.enabled;
			})
			.map((s) => {
				const entry = manifest[s.name];
				return {
					name: s.name,
					alias: s.alias || entry?.alias,
					description: entry?.marketDescription || s.description,
					source: s.source,
					type: s.type,
				};
			});
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
			};

			const buffer = Buffer.isBuffer(archiveBuffer) ? archiveBuffer : Buffer.from(archiveBuffer as ArrayBuffer);

			const baseDir = getBaseDir(itemType);
			if (!existsSync(baseDir)) {
				await mkdir(baseDir, { recursive: true });
			}

			const skillDir = join(baseDir, name);
			if (!existsSync(skillDir)) {
				await mkdir(skillDir, { recursive: true });
			}

			const tmpFile = join(baseDir, `_tmp_${name}_${Date.now()}.tar.gz`);
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

			const version = parseVersionFromSkillDir(skillDir);

			const manifest = readManifest();
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
		},
	);

	ipcMain.handle("vetta:skills:uninstall", async (_event, name: unknown, type: unknown) => {
		assertNonEmptyString(name, "name");

		// Determine type from argument, falling back to manifest, then default to skill
		const manifest = readManifest();
		const itemType: "skill" | "scene" =
			type === "scene" ? "scene" : manifest[name]?.type === "scene" ? "scene" : "skill";

		const skillDir = join(getBaseDir(itemType), name);
		if (existsSync(skillDir)) {
			await rm(skillDir, { recursive: true, force: true });
		}

		delete manifest[name];
		writeManifest(manifest);
	});

	ipcMain.handle("vetta:skills:toggle", async (_event, name: unknown) => {
		assertNonEmptyString(name, "name");

		const manifest = readManifest();
		const entry = manifest[name];
		if (!entry) {
			throw new Error(`Skill "${name}" is not installed`);
		}
		entry.enabled = !entry.enabled;
		writeManifest(manifest);
	});

	ipcMain.handle("vetta:skills:get-market-manifest", async () => {
		return readManifest();
	});

	ipcMain.handle("vetta:skills:get-skill-md-path", async (_event, name: unknown, type: unknown) => {
		assertNonEmptyString(name, "name");
		const itemType: "skill" | "scene" = type === "scene" ? "scene" : "skill";
		const skillMd = join(getBaseDir(itemType), name, "SKILL.md");
		if (!existsSync(skillMd)) {
			throw new Error(`SKILL.md 不存在：${skillMd}`);
		}
		return skillMd;
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
