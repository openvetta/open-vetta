import { ipcMain, webContents } from "electron";
import type { AppMonitorResourceOperation, AppMonitorResourceSource } from "../../preload/api-types/app-monitor.js";
import type {
	InstalledPlugin,
	PluginCommandRunOptions,
	PluginEditImageInput,
	PluginGenerateImageInput,
	PluginInstallOptions,
	PluginPermission,
} from "../../preload/api-types/plugins.js";
import { recordAppMonitorEvent } from "../app-monitor/app-monitor-service.js";
import { getAppLogger } from "../logger.js";
import { runPluginCommand } from "../plugins/command-runner.js";
import { editImage, generateImage, imageLineage, sessionLineages } from "../plugins/image-service.js";
import {
	beginDynamicAgentContributionLoad,
	buildAgentPluginRuntimeConfig,
	clearDynamicAgentContributions,
	getPluginSettings,
	grantPluginCommands,
	grantPluginPermissions,
	installPluginFromArchive,
	installPluginFromUrl,
	listPlugins,
	registerDynamicAgentTool,
	registerDynamicContinuationProvider,
	registerDynamicSystemPromptProvider,
	reloadPlugin,
	revokePluginCommands,
	revokePluginPermissions,
	setPluginEnabled,
	setPluginSettings,
	summarizeAgentPluginRuntimeConfig,
	uninstallPlugin,
	unregisterDynamicAgentTool,
	unregisterDynamicContinuationProvider,
	unregisterDynamicSystemPromptProvider,
} from "../plugins/plugin-store.js";
import { getSharedRuntime } from "../runtime.js";

function asArchiveBuffer(value: unknown): ArrayBuffer | Buffer {
	if (value instanceof ArrayBuffer || Buffer.isBuffer(value)) return value;
	throw new Error("Invalid plugin archive buffer");
}

function asOptions(value: unknown): PluginInstallOptions | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "object") throw new Error("Invalid plugin install options");
	const input = value as Record<string, unknown>;
	const source = input.source === "remote" ? "remote" : input.source === "archive" ? "archive" : undefined;
	const grantedPermissions =
		Array.isArray(input.grantedPermissions) && input.grantedPermissions.every((item) => typeof item === "string")
			? (input.grantedPermissions as PluginPermission[])
			: undefined;
	return { source, grantedPermissions };
}

function asPluginId(value: unknown): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error("Invalid plugin id");
	}
	return value.trim();
}

function asOptionalStringId(value: unknown, fieldName: string): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Invalid ${fieldName}`);
	}
	return value.trim();
}

function asPermissions(value: unknown): PluginPermission[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
		throw new Error("Invalid plugin permissions");
	}
	return value as PluginPermission[];
}

function asCommandNames(value: unknown): string[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
		throw new Error("Invalid plugin command names");
	}
	return value as string[];
}

function asRecord(value: unknown, fieldName: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`Invalid ${fieldName}`);
	}
	return value as Record<string, unknown>;
}

function asOptionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asOptionalStringArray(value: unknown): string[] | undefined {
	if (value == null) return undefined;
	if (!Array.isArray(value)) return undefined;
	const out = value.filter((v): v is string => typeof v === "string" && v.length > 0);
	return out.length > 0 ? out : [];
}

function asHandlerContext(value: unknown): { conversation?: "summary" | "messages" } | undefined {
	if (value === undefined) return undefined;
	const input = asRecord(value, "handler context");
	return { conversation: input.conversation === "messages" ? "messages" : "summary" };
}

function asAgentToolRegistration(value: unknown): {
	id: string;
	name: string;
	label?: string;
	description: string;
	parameters: Record<string, unknown>;
	handlerId: string;
	activationId?: string;
	timeoutMs?: number;
	scope_use?: string[];
	requires?: string[];
	context?: { conversation?: "summary" | "messages" };
} {
	const input = asRecord(value, "agent tool registration");
	const id = asPluginId(input.id);
	const name = asPluginId(input.name ?? id);
	const description = asOptionalString(input.description);
	const handlerId = asPluginId(input.handlerId);
	const activationId = asOptionalStringId(input.activationId, "agent tool activation id");
	if (!description) throw new Error("Invalid agent tool description");
	const parameters = asRecord(input.parameters, "agent tool parameters");
	const timeoutMs =
		typeof input.timeoutMs === "number" && Number.isFinite(input.timeoutMs) && input.timeoutMs > 0
			? Math.min(Math.floor(input.timeoutMs), 120_000)
			: undefined;
	return {
		id,
		name,
		label: asOptionalString(input.label),
		description,
		parameters,
		handlerId,
		activationId,
		timeoutMs,
		scope_use: asOptionalStringArray(input.scope_use),
		requires: asOptionalStringArray(input.requires),
		context: asHandlerContext(input.context),
	};
}

function asContinuationRegistration(value: unknown): {
	id: string;
	handlerId: string;
	activationId?: string;
	timeoutMs?: number;
	context?: { conversation?: "summary" | "messages" };
} {
	const input = asRecord(value, "continuation registration");
	return {
		id: asPluginId(input.id),
		handlerId: asPluginId(input.handlerId),
		activationId: asOptionalStringId(input.activationId, "continuation activation id"),
		timeoutMs:
			typeof input.timeoutMs === "number" && Number.isFinite(input.timeoutMs) && input.timeoutMs > 0
				? Math.min(Math.floor(input.timeoutMs), 30_000)
				: undefined,
		context: asHandlerContext(input.context),
	};
}

function asSystemPromptProviderRegistration(value: unknown): {
	id: string;
	handlerId: string;
	activationId?: string;
	timeoutMs?: number;
	context?: {
		systemPrompt?: "none" | "blocks" | "rendered" | "full";
		conversation?: "summary" | "messages";
	};
} {
	const input = asRecord(value, "system prompt provider registration");
	const contextInput =
		input.context === undefined ? undefined : asRecord(input.context, "system prompt provider context");
	const systemPrompt =
		contextInput?.systemPrompt === "blocks" ||
		contextInput?.systemPrompt === "rendered" ||
		contextInput?.systemPrompt === "full"
			? contextInput.systemPrompt
			: "none";
	const conversation = contextInput?.conversation === "messages" ? "messages" : "summary";
	return {
		id: asPluginId(input.id),
		handlerId: asPluginId(input.handlerId),
		activationId: asOptionalStringId(input.activationId, "system prompt provider activation id"),
		timeoutMs:
			typeof input.timeoutMs === "number" && Number.isFinite(input.timeoutMs) && input.timeoutMs > 0
				? Math.min(Math.floor(input.timeoutMs), 30_000)
				: undefined,
		context: contextInput ? { systemPrompt, conversation } : undefined,
	};
}

const pluginLog = getAppLogger("plugin");

function refreshAgentPlugins(): void {
	const config = buildAgentPluginRuntimeConfig();
	pluginLog.debug("refresh agent plugins", summarizeAgentPluginRuntimeConfig(config));
	getSharedRuntime().reconfigureAgentPlugins(config);
}

function recordPluginResourceEvent(input: {
	plugin: Pick<InstalledPlugin, "id" | "source">;
	operation: AppMonitorResourceOperation;
	permissionCount?: number;
	commandCount?: number;
}): void {
	try {
		recordAppMonitorEvent({
			type: "resource.lifecycle",
			resourceKind: "plugin",
			operation: input.operation,
			resourceId: input.plugin.id,
			source: toAppMonitorPluginSource(input.plugin.source),
			system: input.plugin.source === "system",
			...(input.permissionCount === undefined ? {} : { permissionCount: input.permissionCount }),
			...(input.commandCount === undefined ? {} : { commandCount: input.commandCount }),
		});
	} catch {
		// Monitoring must not affect plugin operations.
	}
}

function toAppMonitorPluginSource(source: InstalledPlugin["source"]): AppMonitorResourceSource {
	if (source === "system") return "system";
	if (source === "remote") return "remote";
	return "archive";
}

function isFreshPluginInstall(plugin: Pick<InstalledPlugin, "installedAt" | "updatedAt">): boolean {
	return plugin.installedAt === plugin.updatedAt;
}

function countAdded(previous: readonly string[], next: readonly string[]): number {
	const before = new Set(previous);
	return next.filter((item) => !before.has(item)).length;
}

function countRemoved(previous: readonly string[], next: readonly string[]): number {
	const after = new Set(next);
	return previous.filter((item) => !after.has(item)).length;
}

export function registerPluginsIpc(): () => void {
	ipcMain.handle("vetta:plugins:list", () => listPlugins());
	ipcMain.handle("vetta:plugins:install-from-archive", async (_event, archiveBuffer: unknown, options: unknown) => {
		const plugin = await installPluginFromArchive(asArchiveBuffer(archiveBuffer), asOptions(options));
		recordPluginResourceEvent({
			plugin,
			operation: isFreshPluginInstall(plugin) ? "installed" : "updated",
		});
		return plugin;
	});
	ipcMain.handle("vetta:plugins:install-from-url", (_event, url: unknown, options: unknown) => {
		if (typeof url !== "string" || url.trim().length === 0) {
			throw new Error("Invalid plugin URL");
		}
		return installPluginFromUrl(url.trim(), asOptions(options)).then((plugin) => {
			recordPluginResourceEvent({
				plugin,
				operation: isFreshPluginInstall(plugin) ? "installed" : "updated",
			});
			return plugin;
		});
	});
	ipcMain.handle("vetta:plugins:uninstall", (_event, id: unknown) => {
		const pluginId = asPluginId(id);
		const plugin = listPlugins().find((candidate) => candidate.id === pluginId);
		uninstallPlugin(pluginId);
		refreshAgentPlugins();
		if (plugin) recordPluginResourceEvent({ plugin, operation: "uninstalled" });
	});
	ipcMain.handle("vetta:plugins:set-enabled", (_event, id: unknown, enabled: unknown) => {
		const plugin = setPluginEnabled(asPluginId(id), enabled === true);
		refreshAgentPlugins();
		recordPluginResourceEvent({ plugin, operation: plugin.enabled ? "enabled" : "disabled" });
		return plugin;
	});
	ipcMain.handle("vetta:plugins:grant-permissions", (_event, id: unknown, permissions: unknown) => {
		const pluginId = asPluginId(id);
		const previous = listPlugins().find((candidate) => candidate.id === pluginId)?.grantedPermissions ?? [];
		const plugin = grantPluginPermissions(pluginId, asPermissions(permissions));
		refreshAgentPlugins();
		recordPluginResourceEvent({
			plugin,
			operation: "permissions-granted",
			permissionCount: countAdded(previous, plugin.grantedPermissions),
		});
		return plugin;
	});
	ipcMain.handle("vetta:plugins:revoke-permissions", (_event, id: unknown, permissions: unknown) => {
		const pluginId = asPluginId(id);
		const previous = listPlugins().find((candidate) => candidate.id === pluginId)?.grantedPermissions ?? [];
		const plugin = revokePluginPermissions(pluginId, asPermissions(permissions));
		refreshAgentPlugins();
		recordPluginResourceEvent({
			plugin,
			operation: "permissions-revoked",
			permissionCount: countRemoved(previous, plugin.grantedPermissions),
		});
		return plugin;
	});
	ipcMain.handle("vetta:plugins:grant-commands", (_event, id: unknown, names: unknown) => {
		const pluginId = asPluginId(id);
		const previous = listPlugins().find((candidate) => candidate.id === pluginId)?.grantedCommandNames ?? [];
		const plugin = grantPluginCommands(pluginId, asCommandNames(names));
		recordPluginResourceEvent({
			plugin,
			operation: "commands-granted",
			commandCount: countAdded(previous, plugin.grantedCommandNames),
		});
		return plugin;
	});
	ipcMain.handle("vetta:plugins:revoke-commands", (_event, id: unknown, names: unknown) => {
		const pluginId = asPluginId(id);
		const previous = listPlugins().find((candidate) => candidate.id === pluginId)?.grantedCommandNames ?? [];
		const plugin = revokePluginCommands(pluginId, asCommandNames(names));
		recordPluginResourceEvent({
			plugin,
			operation: "commands-revoked",
			commandCount: countRemoved(previous, plugin.grantedCommandNames),
		});
		return plugin;
	});
	ipcMain.handle(
		"vetta:plugins:command-run",
		(_event, pluginId: unknown, file: unknown, args: unknown, options: unknown) =>
			runPluginCommand(
				asPluginId(pluginId),
				typeof file === "string" ? file : "",
				args,
				(options ?? undefined) as PluginCommandRunOptions | undefined,
			),
	);
	ipcMain.handle("vetta:plugins:reload", (_event, id: unknown) => {
		const plugin = reloadPlugin(asPluginId(id));
		refreshAgentPlugins();
		recordPluginResourceEvent({ plugin, operation: "reloaded" });
		return plugin;
	});
	ipcMain.handle(
		"vetta:plugins:agent-contributions-begin-load",
		(_event, pluginId: unknown, activationId: unknown) => {
			const normalizedPluginId = asPluginId(pluginId);
			const normalizedActivationId = asPluginId(activationId);
			pluginLog.debug("ipc agent-tools-begin-load", {
				pluginId: normalizedPluginId,
				activationId: normalizedActivationId,
			});
			beginDynamicAgentContributionLoad(normalizedPluginId, normalizedActivationId);
			refreshAgentPlugins();
		},
	);
	ipcMain.handle("vetta:plugins:continuation-register", (_event, pluginId: unknown, registration: unknown) => {
		registerDynamicContinuationProvider(asPluginId(pluginId), asContinuationRegistration(registration));
		refreshAgentPlugins();
	});
	ipcMain.handle(
		"vetta:plugins:system-prompt-provider-register",
		(_event, pluginId: unknown, registration: unknown) => {
			registerDynamicSystemPromptProvider(asPluginId(pluginId), asSystemPromptProviderRegistration(registration));
			refreshAgentPlugins();
		},
	);
	ipcMain.handle(
		"vetta:plugins:system-prompt-provider-unregister",
		(_event, pluginId: unknown, providerId: unknown, activationId: unknown) => {
			unregisterDynamicSystemPromptProvider(
				asPluginId(pluginId),
				asPluginId(providerId),
				asOptionalStringId(activationId, "system prompt provider activation id"),
			);
			refreshAgentPlugins();
		},
	);
	ipcMain.handle(
		"vetta:plugins:continuation-unregister",
		(_event, pluginId: unknown, providerId: unknown, activationId: unknown) => {
			unregisterDynamicContinuationProvider(
				asPluginId(pluginId),
				asPluginId(providerId),
				asOptionalStringId(activationId, "continuation activation id"),
			);
			refreshAgentPlugins();
		},
	);
	ipcMain.handle("vetta:plugins:agent-tool-register", (_event, pluginId: unknown, registration: unknown) => {
		const normalizedPluginId = asPluginId(pluginId);
		const normalizedRegistration = asAgentToolRegistration(registration);
		pluginLog.debug("ipc agent-tool-register", {
			pluginId: normalizedPluginId,
			toolId: normalizedRegistration.id,
			toolName: normalizedRegistration.name,
			handlerId: normalizedRegistration.handlerId,
			activationId: normalizedRegistration.activationId,
		});
		registerDynamicAgentTool(normalizedPluginId, normalizedRegistration);
		refreshAgentPlugins();
	});
	ipcMain.handle(
		"vetta:plugins:agent-tool-unregister",
		(_event, pluginId: unknown, toolId: unknown, activationId: unknown) => {
			const normalizedPluginId = asPluginId(pluginId);
			const normalizedToolId = asPluginId(toolId);
			const normalizedActivationId = asOptionalStringId(activationId, "agent tool activation id");
			pluginLog.debug("ipc agent-tool-unregister", {
				pluginId: normalizedPluginId,
				toolId: normalizedToolId,
				activationId: normalizedActivationId,
			});
			unregisterDynamicAgentTool(normalizedPluginId, normalizedToolId, normalizedActivationId);
			refreshAgentPlugins();
		},
	);
	ipcMain.handle("vetta:plugins:agent-contributions-clear", (_event, pluginId: unknown, activationId: unknown) => {
		const normalizedPluginId = asPluginId(pluginId);
		const normalizedActivationId = asOptionalStringId(activationId, "agent tool activation id");
		pluginLog.debug("ipc agent-tools-clear", {
			pluginId: normalizedPluginId,
			activationId: normalizedActivationId,
		});
		clearDynamicAgentContributions(normalizedPluginId, normalizedActivationId);
		refreshAgentPlugins();
	});
	ipcMain.handle("vetta:plugins:get-settings", (_event, id: unknown) => getPluginSettings(asPluginId(id)));
	ipcMain.handle("vetta:plugins:set-settings", (_event, id: unknown, values: unknown) => {
		const pluginId = asPluginId(id);
		if (values == null || typeof values !== "object" || Array.isArray(values)) {
			throw new Error("Invalid plugin settings values");
		}
		const effective = setPluginSettings(pluginId, values as Record<string, unknown>);
		refreshAgentPlugins();
		// Broadcast so the plugin host (and any open settings view) can react live.
		for (const contents of webContents.getAllWebContents()) {
			contents.send("vetta:plugins:settings-changed", { pluginId, values: effective });
		}
	});
	ipcMain.handle("vetta:plugins:images:generate", (_event, id: unknown, input: unknown) =>
		generateImage(asPluginId(id), input as PluginGenerateImageInput),
	);
	ipcMain.handle("vetta:plugins:images:edit", (_event, id: unknown, input: unknown) =>
		editImage(asPluginId(id), input as PluginEditImageInput),
	);
	ipcMain.handle("vetta:plugins:images:lineage", (_event, id: unknown, imageId: unknown) => {
		if (typeof imageId !== "string" || imageId.trim().length === 0) {
			throw new Error("Invalid image id");
		}
		return imageLineage(asPluginId(id), imageId.trim());
	});
	ipcMain.handle("vetta:plugins:images:session-lineages", (_event, id: unknown, sessionId: unknown) => {
		if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
			throw new Error("Invalid session id");
		}
		return sessionLineages(asPluginId(id), sessionId.trim());
	});

	return () => {
		ipcMain.removeHandler("vetta:plugins:list");
		ipcMain.removeHandler("vetta:plugins:install-from-archive");
		ipcMain.removeHandler("vetta:plugins:install-from-url");
		ipcMain.removeHandler("vetta:plugins:uninstall");
		ipcMain.removeHandler("vetta:plugins:set-enabled");
		ipcMain.removeHandler("vetta:plugins:grant-permissions");
		ipcMain.removeHandler("vetta:plugins:revoke-permissions");
		ipcMain.removeHandler("vetta:plugins:grant-commands");
		ipcMain.removeHandler("vetta:plugins:revoke-commands");
		ipcMain.removeHandler("vetta:plugins:command-run");
		ipcMain.removeHandler("vetta:plugins:reload");
		ipcMain.removeHandler("vetta:plugins:agent-contributions-begin-load");
		ipcMain.removeHandler("vetta:plugins:agent-tool-register");
		ipcMain.removeHandler("vetta:plugins:agent-tool-unregister");
		ipcMain.removeHandler("vetta:plugins:agent-contributions-clear");
		ipcMain.removeHandler("vetta:plugins:continuation-register");
		ipcMain.removeHandler("vetta:plugins:continuation-unregister");
		ipcMain.removeHandler("vetta:plugins:system-prompt-provider-register");
		ipcMain.removeHandler("vetta:plugins:system-prompt-provider-unregister");
		ipcMain.removeHandler("vetta:plugins:get-settings");
		ipcMain.removeHandler("vetta:plugins:set-settings");
		ipcMain.removeHandler("vetta:plugins:images:generate");
		ipcMain.removeHandler("vetta:plugins:images:edit");
		ipcMain.removeHandler("vetta:plugins:images:lineage");
		ipcMain.removeHandler("vetta:plugins:images:session-lineages");
	};
}
