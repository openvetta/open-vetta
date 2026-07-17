import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const desktopAppDir = join(import.meta.dirname, "..");
export const skillPresetsDir = join(desktopAppDir, "..", "skill-presets");
const manifestFileName = "skills-manifest.json";

function readManifest() {
	const manifestPath = join(skillPresetsDir, manifestFileName);
	if (!existsSync(manifestPath)) {
		throw new Error(`[system-skills] 缺少内置 Skill 清单：${manifestPath}`);
	}
	const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
	if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
		throw new Error(`[system-skills] 内置 Skill 清单格式无效：${manifestPath}`);
	}
	return manifest;
}

export function stageSystemSkills(targetDir, logPrefix = "system-skills") {
	rmSync(targetDir, { recursive: true, force: true });
	mkdirSync(targetDir, { recursive: true });

	if (!existsSync(skillPresetsDir)) {
		throw new Error(`[${logPrefix}] 缺少内置 Skill 目录：${skillPresetsDir}`);
	}

	const manifest = readManifest();
	const registeredNames = new Set(Object.keys(manifest));
	for (const name of readdirSync(skillPresetsDir)) {
		const source = join(skillPresetsDir, name);
		if (statSync(source).isDirectory() && !registeredNames.has(name)) {
			throw new Error(`[${logPrefix}] 内置 Skill 未在 ${manifestFileName} 注册：${name}`);
		}
	}

	let count = 0;
	for (const [name, rawEntry] of Object.entries(manifest)) {
		if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
			throw new Error(`[${logPrefix}] 内置 Skill 清单条目格式无效：${name}`);
		}
		const entry = rawEntry;
		if (entry.name !== name) {
			throw new Error(`[${logPrefix}] 内置 Skill 清单 name 与键不一致：${name}`);
		}
		if (entry.enabled === false) continue;

		const source = join(skillPresetsDir, name);
		if (!existsSync(join(source, "SKILL.md"))) {
			throw new Error(`[${logPrefix}] 已注册的内置 Skill 缺少 SKILL.md：${source}`);
		}
		cpSync(source, join(targetDir, name), { recursive: true });
		count += 1;
		console.log(`[${logPrefix}] staged ${name}`);
	}

	if (count === 0) {
		throw new Error(`[${logPrefix}] ${manifestFileName} 中没有启用的内置 Skill`);
	}
	cpSync(join(skillPresetsDir, manifestFileName), join(targetDir, manifestFileName));
	return count;
}
