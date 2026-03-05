import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function loadToolDescription(moduleUrl: string, fallback: string): string {
	try {
		const moduleDir = dirname(fileURLToPath(moduleUrl));
		return readFileSync(join(moduleDir, "description.txt"), "utf-8").trim();
	} catch {
		return fallback;
	}
}
