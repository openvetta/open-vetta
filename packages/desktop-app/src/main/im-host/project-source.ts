import { existsSync, readFileSync, watchFile } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProjectEntry } from "./host-protocol.js";

/**
 * Read the desktop-app project list from ~/.vetta/desktop-config.json and
 * keep ImHost in sync with it via a polling watch.
 *
 * Why polling instead of fs.watch? `fs.watch` is unreliable across
 * platforms (macOS rename-based atomic writes lose the watcher; Linux
 * needs inotify; Windows has its own quirks). `watchFile` polls every
 * second by default — overhead is negligible and the behavior is
 * identical on all three OSes. The desktop-app writes the file via
 * atomic-write so partial reads are impossible.
 */

const DESKTOP_CONFIG_PATH = join(homedir(), ".vetta", "desktop-config.json");

interface RawDesktopConfig {
	projects?: Array<{ path?: string; name?: string }>;
}

export function loadDesktopProjects(filePath = DESKTOP_CONFIG_PATH): ProjectEntry[] {
	if (!existsSync(filePath)) return [];
	try {
		const raw = readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(raw) as RawDesktopConfig;
		const projects = Array.isArray(parsed.projects) ? parsed.projects : [];
		return projects
			.filter((p): p is { path: string; name?: string } => typeof p?.path === "string" && p.path.length > 0)
			.map((p) => ({
				path: p.path,
				name: p.name,
			}));
	} catch {
		return [];
	}
}

/**
 * Watch the desktop-config.json file. Calls onChange with the new project
 * list whenever a write is detected. Returns an unwatch function.
 */
export function watchDesktopProjects(
	onChange: (projects: ProjectEntry[]) => void,
	filePath = DESKTOP_CONFIG_PATH,
): () => void {
	let lastSerialized = JSON.stringify(loadDesktopProjects(filePath));
	const handler = () => {
		const next = loadDesktopProjects(filePath);
		const serialized = JSON.stringify(next);
		if (serialized !== lastSerialized) {
			lastSerialized = serialized;
			onChange(next);
		}
	};
	watchFile(filePath, { interval: 1000 }, handler);
	return () => {
		// import lazily to avoid pulling unwatchFile into the static
		// import graph if it's never used.
		import("node:fs").then(({ unwatchFile }) => {
			unwatchFile(filePath, handler);
		});
	};
}
