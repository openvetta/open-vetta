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
const manifestPath = join(homedir(), ".vetta", "skills-manifest.json");

interface InstalledMarketSkill {
	name: string;
	version: string;
	installedAt: string;
	source: "market";
}

function readManifest(): Record<string, InstalledMarketSkill> {
	if (!existsSync(manifestPath)) return {};
	try {
		return JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, InstalledMarketSkill>;
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
		return skills.map((s) => ({ name: s.name, description: s.description, source: s.source, type: s.type }));
	});

	ipcMain.handle("vetta:skills:install-from-market", async (_event, name: unknown, archiveBuffer: unknown) => {
		assertNonEmptyString(name, "name");
		if (!(archiveBuffer instanceof ArrayBuffer) && !Buffer.isBuffer(archiveBuffer)) {
			throw new Error("Invalid archive buffer");
		}

		const buffer = Buffer.isBuffer(archiveBuffer) ? archiveBuffer : Buffer.from(archiveBuffer as ArrayBuffer);

		if (!existsSync(skillsBaseDir)) {
			await mkdir(skillsBaseDir, { recursive: true });
		}

		const skillDir = join(skillsBaseDir, name);
		if (!existsSync(skillDir)) {
			await mkdir(skillDir, { recursive: true });
		}

		const tmpFile = join(skillsBaseDir, `_tmp_${name}_${Date.now()}.tar.gz`);
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
		};
		writeManifest(manifest);
	});

	ipcMain.handle("vetta:skills:uninstall", async (_event, name: unknown) => {
		assertNonEmptyString(name, "name");

		const skillDir = join(skillsBaseDir, name);
		if (existsSync(skillDir)) {
			await rm(skillDir, { recursive: true, force: true });
		}

		const manifest = readManifest();
		delete manifest[name];
		writeManifest(manifest);
	});

	ipcMain.handle("vetta:skills:get-market-manifest", async () => {
		return readManifest();
	});

	return () => {
		ipcMain.removeHandler("vetta:skills:list");
		ipcMain.removeHandler("vetta:skills:install-from-market");
		ipcMain.removeHandler("vetta:skills:uninstall");
		ipcMain.removeHandler("vetta:skills:get-market-manifest");
	};
}
