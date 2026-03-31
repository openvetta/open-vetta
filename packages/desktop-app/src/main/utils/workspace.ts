import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_PATH = join(homedir(), ".vetta", "desktop-config.json");
const DEFAULT_WORKSPACE_PATH = join(homedir(), ".vetta", "workspace");

export async function getWorkspacePath(): Promise<string> {
	try {
		const raw = await readFile(CONFIG_PATH, "utf8");
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		if (typeof parsed.workspacePath === "string") {
			return parsed.workspacePath;
		}
	} catch {
		// ignore
	}
	return DEFAULT_WORKSPACE_PATH;
}
