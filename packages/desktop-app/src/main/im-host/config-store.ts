import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { atomicWriteJSON } from "../utils/atomic-write.js";

/**
 * Non-secret IM bridge configuration. Stored in plaintext under
 *   ~/.vetta/desktop-app/im-config.json
 *
 * Sensitive fields (App Secret, Verification Token, Encrypt Key) live in
 * credential-store.ts; this file only carries the toggles and identifiers
 * the user is willing to expose to the filesystem in plaintext.
 */
export interface ImConfig {
	enabled: boolean;
	feishu: {
		appId: string;
		baseUrl?: string;
	};
	transportMode: "long-connection";
}

const DEFAULT_PATH = join(homedir(), ".vetta", "desktop-app", "im-config.json");

export function defaultImConfigPath(): string {
	return DEFAULT_PATH;
}

export function defaultImConfig(): ImConfig {
	return {
		enabled: false,
		feishu: { appId: "" },
		transportMode: "long-connection",
	};
}

export function loadImConfig(filePath = DEFAULT_PATH): ImConfig {
	if (!existsSync(filePath)) return defaultImConfig();
	try {
		const raw = readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(raw) as Partial<ImConfig>;
		return {
			enabled: Boolean(parsed.enabled),
			feishu: {
				appId: parsed.feishu?.appId ?? "",
				baseUrl: parsed.feishu?.baseUrl,
			},
			transportMode: "long-connection",
		};
	} catch {
		return defaultImConfig();
	}
}

export function saveImConfig(config: ImConfig, filePath = DEFAULT_PATH): void {
	atomicWriteJSON(filePath, config);
}
