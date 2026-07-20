import type { InstalledPlugin } from "@preload/api";
import type {
	PluginOfficialApi,
	PluginOfficialExperimentalSettings,
	PluginOfficialWebhookEndpoint,
} from "@vetta-org/plugin-sdk";

function normalizeExperimental(
	config: Awaited<ReturnType<typeof window.vetta.config.get>>,
): PluginOfficialExperimentalSettings {
	return {
		vettaCli: config.experimental?.vettaCli !== false,
		promptPrediction: config.experimental?.promptPrediction !== false,
		agentSkills: config.experimental?.agentSkills !== false,
	};
}

function requireWebhookEndpoint(
	result: Awaited<ReturnType<typeof window.vetta.webhook.create>>,
): PluginOfficialWebhookEndpoint {
	if (!result.ok || !result.endpoint) throw new Error(result.error ?? "Webhook operation failed");
	return result.endpoint;
}

export function createPluginOfficialApi(plugin: InstalledPlugin): PluginOfficialApi {
	const assertOfficial = (): void => {
		if (plugin.trustLevel !== "official") {
			throw new Error(`Plugin ${plugin.id} is not allowed to use official host capabilities`);
		}
	};
	return {
		general: {
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
					const isAbsolute = path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\");
					if (!isAbsolute) throw new Error("workspace path must be absolute");
					await window.vetta.config.set({ workspacePath: path });
					return { operation: input.operation, path };
				}
				throw new Error("Unsupported general settings operation");
			},
		},
		agent: {
			getExperimental: async () => {
				assertOfficial();
				return normalizeExperimental(await window.vetta.config.get());
			},
			setExperimental: async (input) => {
				assertOfficial();
				await window.vetta.config.set({ experimental: input });
				return normalizeExperimental(await window.vetta.config.get());
			},
		},
		downloads: {
			list: async () => {
				assertOfficial();
				return window.vetta.downloads.list();
			},
			cancel: async (id) => {
				assertOfficial();
				await window.vetta.downloads.cancel(id);
			},
		},
		updater: {
			getState: async () => {
				assertOfficial();
				return window.vetta.updater.getState();
			},
			getCurrentVersion: async () => {
				assertOfficial();
				return window.vetta.updater.getCurrentVersion();
			},
			check: async () => {
				assertOfficial();
				return window.vetta.updater.check();
			},
			download: async () => {
				assertOfficial();
				return window.vetta.updater.download();
			},
			install: async () => {
				assertOfficial();
				await window.vetta.updater.install();
			},
			dismiss: async () => {
				assertOfficial();
				await window.vetta.updater.dismiss();
			},
			cancel: async () => {
				assertOfficial();
				await window.vetta.updater.cancel();
			},
		},
		webhook: {
			list: async () => {
				assertOfficial();
				return window.vetta.webhook.list();
			},
			listProviders: async () => {
				assertOfficial();
				return window.vetta.webhook.listProviders();
			},
			create: async (input) => {
				assertOfficial();
				return requireWebhookEndpoint(await window.vetta.webhook.create(input));
			},
			update: async (id, input) => {
				assertOfficial();
				return requireWebhookEndpoint(await window.vetta.webhook.update(id, input));
			},
			setEnabled: async (id, enabled) => {
				assertOfficial();
				return requireWebhookEndpoint(await window.vetta.webhook.toggle(id, enabled));
			},
			delete: async (id) => {
				assertOfficial();
				await window.vetta.webhook.delete(id);
			},
			test: async (id) => {
				assertOfficial();
				return window.vetta.webhook.test(id);
			},
			send: async (id, message) => {
				assertOfficial();
				return window.vetta.webhook.send(id, message);
			},
		},
	};
}
