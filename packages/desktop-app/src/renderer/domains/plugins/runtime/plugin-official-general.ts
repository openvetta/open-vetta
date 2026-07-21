import type { PluginOfficialApi } from "@vetta-org/plugin-sdk";

function isAbsolutePath(path: string): boolean {
	return path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

export function createOfficialGeneralApi(assertOfficial: () => void): PluginOfficialApi["general"] {
	return {
		getSettings: async () => {
			assertOfficial();
			const config = await window.vetta.config.get();
			return {
				workspacePath: config.workspacePath,
				defaultExecutionMode: config.defaultExecutionMode,
				notificationsEnabled: config.notificationsEnabled !== false,
				debugMode: Boolean(config.debugMode),
				sandbox: config.sandbox ?? config.linuxSandbox,
			};
		},
		setSettings: async (input) => {
			assertOfficial();
			if (input.operation === "set-notifications") {
				if (typeof input.enabled !== "boolean") throw new Error("enabled must be a boolean");
				await window.vetta.config.set({ notificationsEnabled: input.enabled });
				return { operation: input.operation, enabled: input.enabled };
			}
			if (input.operation === "set-execution-mode") {
				if (input.mode !== "sandbox" && input.mode !== "full-access") {
					throw new Error("mode must be sandbox or full-access");
				}
				await window.vetta.config.set({ defaultExecutionMode: input.mode });
				return { operation: input.operation, mode: input.mode };
			}
			if (input.operation === "set-workspace") {
				const path = typeof input.path === "string" ? input.path.trim() : "";
				if (!isAbsolutePath(path)) throw new Error("workspace path must be absolute");
				await window.vetta.config.set({ workspacePath: path });
				return { operation: input.operation, path };
			}
			throw new Error("Unsupported general settings operation");
		},
	};
}
