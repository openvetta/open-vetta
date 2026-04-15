import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DefaultResourceLoader } from "@vetta/coding-agent";
import { ipcMain } from "electron";

function assertNonEmptyString(value: unknown, fieldName: string): asserts value is string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Invalid ${fieldName}`);
	}
}

const skillsBaseDir = join(homedir(), ".vetta", "skills");
const sceneBaseDir = join(homedir(), ".vetta", "scene");
const manifestPath = join(homedir(), ".vetta", "skills-manifest.json");

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

function readManifest(): Record<string, InstalledMarketSkill> {
	if (!existsSync(manifestPath)) return {};
	try {
		const raw = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, InstalledMarketSkill>;
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

function writeManifest(manifest: Record<string, InstalledMarketSkill>): void {
	const dir = dirname(manifestPath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
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

	return () => {
		ipcMain.removeHandler("vetta:skills:list");
		ipcMain.removeHandler("vetta:skills:install-from-market");
		ipcMain.removeHandler("vetta:skills:uninstall");
		ipcMain.removeHandler("vetta:skills:toggle");
		ipcMain.removeHandler("vetta:skills:get-market-manifest");
	};
}
