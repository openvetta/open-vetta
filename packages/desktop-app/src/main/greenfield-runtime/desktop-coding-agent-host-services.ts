import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@vetta/coding-agent/config";
import { AuthStorage, ModelRegistry, SettingsRuntime } from "@vetta/coding-agent/host-services";
import { DEFAULT_SERVER_URL } from "../constants.js";

let sharedModelRegistry: ModelRegistry | undefined;

export function getOrCreateSharedModelRegistry(): ModelRegistry {
	if (sharedModelRegistry) return sharedModelRegistry;
	const agentDir = getAgentDir();
	const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
	const registry = new ModelRegistry(authStorage, join(agentDir, "models.json"));
	registry.setServerUrl(DEFAULT_SERVER_URL);
	registry.setServerToken(readServerTokenFromDisk());
	registry.setServerTokenGetter(readServerTokenFromDisk);
	void registry.loadRemoteModels();
	sharedModelRegistry = registry;
	return registry;
}

export function readDesktopMcpDebug(cwd: string, agentDir: string): boolean {
	return SettingsRuntime.create(cwd, agentDir).getMcpDebug();
}

function readServerTokenFromDisk(): string | undefined {
	const path = join(getAgentDir(), "settings.json");
	if (!existsSync(path)) return undefined;
	try {
		const settings = JSON.parse(readFileSync(path, "utf8")) as { serverToken?: string };
		return settings.serverToken;
	} catch {
		return undefined;
	}
}
