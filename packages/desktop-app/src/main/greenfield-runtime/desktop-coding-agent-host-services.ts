import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@vetta/coding-agent/config";
import {
	AuthStorage,
	type CodingAgentModelRuntime,
	createCodingAgentModelRuntime,
	SettingsRuntime,
} from "@vetta/coding-agent/host-services";
import { DEFAULT_SERVER_URL } from "../constants.js";

let sharedModelRuntime: CodingAgentModelRuntime | undefined;

export function getOrCreateSharedModelRuntime(): CodingAgentModelRuntime {
	if (sharedModelRuntime) return sharedModelRuntime;
	const agentDir = getAgentDir();
	const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
	const runtime = createCodingAgentModelRuntime(authStorage, { modelsJsonPath: join(agentDir, "models.json") });
	runtime.setServerUrl(DEFAULT_SERVER_URL);
	runtime.setServerToken(readServerTokenFromDisk());
	runtime.setServerTokenGetter(readServerTokenFromDisk);
	void runtime.loadRemoteModels();
	sharedModelRuntime = runtime;
	return runtime;
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
