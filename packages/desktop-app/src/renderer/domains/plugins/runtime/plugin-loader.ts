import { createInstance, type ModuleFederation } from "@module-federation/enhanced/runtime";
import type { InstalledPlugin } from "@preload/api";
import type {
	Disposable,
	PluginActivityTabContribution,
	PluginContext,
	PluginConversationApi,
	PluginDefinition,
	PluginFilePreviewContribution,
	PluginFsApi,
	PluginGlobalSlotContribution,
	PluginPermission,
} from "@vetta/plugin-sdk";
import * as pluginSdk from "@vetta/plugin-sdk";
import type { ComponentType } from "react";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as ReactDom from "react-dom";
import { pluginHostBridge, registerPluginAgentToolHandler } from "./plugin-host-bridge";

export interface LoadedPlugin {
	id: string;
	name: string;
	version: string;
	slots: PluginGlobalSlotContribution[];
	filePreviews: PluginFilePreviewContribution[];
	activityTabs: PluginActivityTabContribution[];
	dispose(): Promise<void>;
}

interface PluginModule {
	default?: PluginDefinition;
	activate?: PluginDefinition["activate"];
	deactivate?: PluginDefinition["deactivate"];
}

let moduleFederationHost: ModuleFederation | undefined;
const registeredRemotes = new Map<string, { alias: string; entry: string }>();

function getModuleFederationHost(): ModuleFederation {
	moduleFederationHost ??= createInstance({
		name: "vetta_plugin_host",
		remotes: [],
		shared: {
			"@vetta/plugin-sdk": {
				version: "1.0.0",
				lib: () => pluginSdk,
				shareConfig: {
					singleton: true,
					requiredVersion: false,
				},
			},
			react: {
				version: React.version,
				lib: () => React,
				shareConfig: {
					singleton: true,
					requiredVersion: false,
				},
			},
			"react-dom": {
				version: ReactDom.version,
				lib: () => ReactDom,
				shareConfig: {
					singleton: true,
					requiredVersion: false,
				},
			},
			"react/jsx-runtime": {
				version: React.version,
				lib: () => jsxRuntime,
				shareConfig: {
					singleton: true,
					requiredVersion: false,
				},
			},
		},
		shareStrategy: "loaded-first",
	});
	return moduleFederationHost;
}

function assertPluginModule(value: unknown): PluginModule {
	if (value == null || typeof value !== "object") {
		throw new Error("Plugin module must export a plugin definition");
	}
	return value as PluginModule;
}

function normalizePluginDefinition(module: PluginModule): PluginDefinition {
	if (module.default) return module.default;
	if (module.activate) {
		return {
			activate: module.activate,
			deactivate: module.deactivate,
		};
	}
	throw new Error("Plugin module must export default definePlugin(...) or activate()");
}

function hasPermission(plugin: InstalledPlugin, permission: PluginPermission): boolean {
	return plugin.permissions.includes(permission) && plugin.grantedPermissions.includes(permission);
}

function createPermissionApi(plugin: InstalledPlugin): PluginContext["permissions"] {
	return {
		has: (permission) => hasPermission(plugin, permission),
		require: (permission) => {
			if (!hasPermission(plugin, permission)) {
				throw new Error(`Plugin permission denied: ${permission}`);
			}
		},
	};
}

const noopDisposable: Disposable = { dispose: () => {} };

function warnSkippedContribution(plugin: InstalledPlugin, permission: PluginPermission, contribution: string): void {
	console.warn(`Plugin ${plugin.id} skipped ${contribution}: missing permission ${permission}`);
}

function loadPluginStyles(plugin: InstalledPlugin): Disposable {
	const links = plugin.styleUrls.map((href) => {
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = href;
		link.dataset.vettaPluginId = plugin.id;
		document.head.append(link);
		return link;
	});
	return {
		dispose: () => {
			for (const link of links) link.remove();
		},
	};
}

function createConversationApi(plugin: InstalledPlugin): PluginConversationApi {
	const permissions = createPermissionApi(plugin);
	return {
		sendPrompt: async (text) => {
			permissions.require("agent.session.write");
			await pluginHostBridge.conversation.sendPrompt(text);
		},
		insertText: (text) => {
			permissions.require("agent.session.write");
			pluginHostBridge.conversation.insertText(text);
		},
		abort: async () => {
			permissions.require("agent.session.write");
			await pluginHostBridge.conversation.abort();
		},
		on: (listener) => {
			permissions.require("agent.session.read");
			return pluginHostBridge.conversation.on(listener);
		},
	};
}

function createFsApi(plugin: InstalledPlugin): PluginFsApi {
	const permissions = createPermissionApi(plugin);
	return {
		readDir: (dirPath) => {
			permissions.require("fs.read");
			return window.vetta.fs.readDir(dirPath);
		},
		readFile: (filePath) => {
			permissions.require("fs.read");
			return window.vetta.fs.readFile(filePath);
		},
		writeFile: (filePath, content) => {
			permissions.require("fs.write");
			return window.vetta.fs.writeFile(filePath, content);
		},
		stat: (filePath) => {
			permissions.require("fs.read");
			return window.vetta.fs.stat(filePath);
		},
		rename: (oldPath, newPath) => {
			permissions.require("fs.write");
			return window.vetta.fs.rename(oldPath, newPath);
		},
		delete: (targetPath) => {
			permissions.require("fs.write");
			return window.vetta.fs.delete(targetPath);
		},
		move: (sourcePath, destDir) => {
			permissions.require("fs.write");
			return window.vetta.fs.move(sourcePath, destDir);
		},
		createDirectory: (dirPath) => {
			permissions.require("fs.write");
			return window.vetta.fs.createDirectory(dirPath);
		},
		listFilesRecursive: (rootPath) => {
			permissions.require("fs.read");
			return window.vetta.fs.listFilesRecursive(rootPath);
		},
	};
}

function createContext(
	plugin: InstalledPlugin,
	slots: PluginGlobalSlotContribution[],
	filePreviews: PluginFilePreviewContribution[],
	activityTabs: PluginActivityTabContribution[],
	onChanged: () => void,
	pendingAgentToolRegistrations: Promise<void>[],
): PluginContext {
	const registerGlobalSlot = (contribution: PluginGlobalSlotContribution): Disposable => {
		if (!hasPermission(plugin, "ui.slot.global")) {
			warnSkippedContribution(plugin, "ui.slot.global", "global slot");
			return noopDisposable;
		}
		if (typeof contribution.id !== "string" || contribution.id.trim().length === 0) {
			throw new Error("Global slot id is required");
		}
		const component = contribution.component as ComponentType;
		if (typeof component !== "function" && typeof component !== "object") {
			throw new Error("Global slot component is invalid");
		}
		const normalized = {
			id: `${plugin.id}:${contribution.id}`,
			component,
		};
		slots.push(normalized);
		onChanged();
		const disposable = {
			dispose: () => {
				const index = slots.findIndex((slot) => slot.id === normalized.id);
				if (index >= 0) slots.splice(index, 1);
				onChanged();
			},
		};
		return disposable;
	};
	const registerFilePreview = (contribution: PluginFilePreviewContribution): Disposable => {
		if (!hasPermission(plugin, "ui.slot.file-preview")) {
			warnSkippedContribution(plugin, "ui.slot.file-preview", "file preview");
			return noopDisposable;
		}
		const extensions = Array.isArray(contribution.extensions)
			? contribution.extensions.map((ext) => ext.trim().toLowerCase()).filter(Boolean)
			: [];
		if (extensions.length === 0) {
			throw new Error("File preview must declare at least one extension");
		}
		if (typeof contribution.component !== "function" && typeof contribution.component !== "object") {
			throw new Error("File preview component is invalid");
		}
		const normalized: PluginFilePreviewContribution = { extensions, component: contribution.component };
		filePreviews.push(normalized);
		onChanged();
		return {
			dispose: () => {
				const index = filePreviews.indexOf(normalized);
				if (index >= 0) filePreviews.splice(index, 1);
				onChanged();
			},
		};
	};
	const registerActivityTab = (contribution: PluginActivityTabContribution): Disposable => {
		if (!hasPermission(plugin, "ui.slot.activity-tab")) {
			warnSkippedContribution(plugin, "ui.slot.activity-tab", "activity tab");
			return noopDisposable;
		}
		if (typeof contribution.id !== "string" || contribution.id.trim().length === 0) {
			throw new Error("Activity tab id is required");
		}
		if (typeof contribution.label !== "string" || contribution.label.trim().length === 0) {
			throw new Error("Activity tab label is required");
		}
		if (typeof contribution.component !== "function" && typeof contribution.component !== "object") {
			throw new Error("Activity tab component is invalid");
		}
		const normalized: PluginActivityTabContribution = {
			id: contribution.id,
			label: contribution.label,
			icon: contribution.icon,
			component: contribution.component,
		};
		activityTabs.push(normalized);
		onChanged();
		return {
			dispose: () => {
				const index = activityTabs.indexOf(normalized);
				if (index >= 0) activityTabs.splice(index, 1);
				onChanged();
			},
		};
	};
	const fs = createFsApi(plugin);
	const conversation = createConversationApi(plugin);
	return {
		plugin: {
			id: plugin.id,
			version: plugin.activeVersion,
		},
		permissions: createPermissionApi(plugin),
		ui: {
			registerGlobalSlot,
			registerFilePreview,
			registerActivityTab,
		},
		conversation,
		fs,
		agent: {
			registerTool: (registration) => {
				if (!hasPermission(plugin, "agent.tools.register")) {
					warnSkippedContribution(plugin, "agent.tools.register", "agent tool");
					return noopDisposable;
				}
				if (typeof registration.id !== "string" || registration.id.trim().length === 0) {
					throw new Error("Agent tool id is required");
				}
				if (typeof registration.description !== "string" || registration.description.trim().length === 0) {
					throw new Error("Agent tool description is required");
				}
				if (typeof registration.parameters !== "object" || registration.parameters === null) {
					throw new Error("Agent tool parameters must be a JSON schema object");
				}
				const toolId = registration.id.trim();
				const handlerId = `${toolId}:${crypto.randomUUID()}`;
				const handlerHandle = registerPluginAgentToolHandler({
					pluginId: plugin.id,
					toolId,
					handlerId,
					handler: (input, api) => registration.handler(input as never, api),
					api: { fs, conversation },
				});
				const registrationPromise = window.vetta.plugins
					.registerAgentTool(plugin.id, {
						id: toolId,
						name: registration.name?.trim() || toolId,
						label: registration.label,
						description: registration.description,
						parameters: registration.parameters as Record<string, unknown>,
						handlerId,
						timeoutMs: registration.timeoutMs,
					})
					.catch((error: Error) => {
						handlerHandle.dispose();
						console.error(`Plugin ${plugin.id} failed to register agent tool ${toolId}`, error);
						throw error;
					});
				pendingAgentToolRegistrations.push(registrationPromise);
				return {
					dispose: () => {
						handlerHandle.dispose();
						void window.vetta.plugins.unregisterAgentTool(plugin.id, toolId);
					},
				};
			},
		},
	};
}

async function assertPluginEntryFetchable(plugin: InstalledPlugin): Promise<void> {
	try {
		const response = await fetch(plugin.entryUrl, { cache: "no-store" });
		if (!response.ok) {
			throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
		}
		const contentType = response.headers.get("content-type") ?? "";
		const expectedContentType = plugin.runtime === "module-federation" ? "json" : "javascript";
		if (!contentType.includes(expectedContentType)) {
			throw new Error(`Unexpected content type: ${contentType || "unknown"}`);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Plugin entry is not fetchable: ${plugin.entryUrl}; ${message}`);
	}
}

async function loadPluginModule(plugin: InstalledPlugin): Promise<PluginModule> {
	if (plugin.runtime !== "module-federation") {
		return assertPluginModule(await import(/* @vite-ignore */ plugin.entryUrl));
	}
	const moduleFederation = plugin.moduleFederation;
	if (!moduleFederation) {
		throw new Error("Module Federation plugin is missing moduleFederation metadata");
	}
	const host = getModuleFederationHost();
	const remote = {
		name: moduleFederation.remoteName,
		alias: plugin.id,
		entry: plugin.entryUrl,
	};
	const registeredRemote = registeredRemotes.get(remote.name);
	if (!registeredRemote || registeredRemote.alias !== remote.alias || registeredRemote.entry !== remote.entry) {
		host.registerRemotes([remote], registeredRemote ? { force: true } : undefined);
		registeredRemotes.set(remote.name, {
			alias: remote.alias,
			entry: remote.entry,
		});
	}
	const expose = moduleFederation.expose.replace(/^\.\//, "");
	const loaded = await host.loadRemote<unknown>(`${moduleFederation.remoteName}/${expose}`, { from: "runtime" });
	if (loaded == null) {
		throw new Error(`Module Federation remote returned null: ${moduleFederation.remoteName}/${expose}`);
	}
	return assertPluginModule(loaded);
}

export async function loadPlugin(plugin: InstalledPlugin, onChanged: () => void): Promise<LoadedPlugin> {
	const slots: PluginGlobalSlotContribution[] = [];
	const filePreviews: PluginFilePreviewContribution[] = [];
	const activityTabs: PluginActivityTabContribution[] = [];
	const styleHandle = loadPluginStyles(plugin);
	await window.vetta.plugins.clearAgentTools(plugin.id);
	await assertPluginEntryFetchable(plugin);
	const module = await loadPluginModule(plugin);
	const definition = normalizePluginDefinition(module);
	const pendingAgentToolRegistrations: Promise<void>[] = [];
	const context = createContext(plugin, slots, filePreviews, activityTabs, onChanged, pendingAgentToolRegistrations);
	await definition.activate(context);
	await Promise.all(pendingAgentToolRegistrations);
	return {
		id: plugin.id,
		name: plugin.name,
		version: plugin.activeVersion,
		slots,
		filePreviews,
		activityTabs,
		dispose: async () => {
			await definition.deactivate?.();
			await window.vetta.plugins.clearAgentTools(plugin.id);
			styleHandle.dispose();
			slots.splice(0, slots.length);
			filePreviews.splice(0, filePreviews.length);
			activityTabs.splice(0, activityTabs.length);
			onChanged();
		},
	};
}
