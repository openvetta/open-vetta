import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { normalizePetConfig, type PetConfig } from "../shared/pet-config.js";
import { atomicWriteJSON } from "./utils/atomic-write.js";

const PET_CONFIG_PATH = join(homedir(), ".vetta", "pet-config.json");

export async function readPetConfig(): Promise<PetConfig> {
	try {
		const raw = await readFile(PET_CONFIG_PATH, "utf8");
		return normalizePetConfig(JSON.parse(raw));
	} catch {
		return normalizePetConfig(undefined);
	}
}

export function readPetConfigSync(): PetConfig {
	try {
		const raw = readFileSync(PET_CONFIG_PATH, "utf8");
		return normalizePetConfig(JSON.parse(raw));
	} catch {
		return normalizePetConfig(undefined);
	}
}

export async function writePetConfig(config: PetConfig): Promise<void> {
	atomicWriteJSON(PET_CONFIG_PATH, normalizePetConfig(config));
}
