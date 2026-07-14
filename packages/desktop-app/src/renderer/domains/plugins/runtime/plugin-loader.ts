import { createInstance, type ModuleFederation } from "@module-federation/enhanced/runtime";
import type { InstalledPlugin } from "@preload/api";
import type { ActivityTabKey } from "@shared/lib/project-profile";
import {
	activeInputActionIdsAtom,
	activeSessionAtom,
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	attachedPluginTabsAtom,
	editImageAttachmentAtom,
	filePreviewAtom,
	languageAtom,
	pluginInputActionsAtom,
	setActivityPanelWidthAtom,
} from "@shared/store/atoms";
import { showToast } from "@shared/store/toast-atoms";
import type {
	Disposable,
	PluginActivityTabContribution,
	PluginAgentToolHandler,
	PluginCardRendererContribution,
	PluginCommandApi,
	PluginContext,
	PluginConversationApi,
	PluginDefinition,
	PluginFilePreviewContribution,
	PluginFsApi,
	PluginGlobalSlotContribution,
	PluginI18nApi,
	PluginImageRef,
	PluginImagesApi,
	PluginInputActionContribution,
	PluginLocales,
	PluginOpenActivityTabOptions,
	PluginPermission,
	PluginSettingsApi,
	PluginToolCallSlotContribution,
	PluginTurnCardContribution,
} from "@vetta-org/plugin-sdk";
import { resolveCatalogKey } from "@vetta-org/plugin-sdk";
import { getDefaultStore } from "jotai";
import type { ComponentType } from "react";
import { router } from "../../../router";
import {
	pluginHostBridge,
	registerPluginAgentToolHandler,
	registerPluginContinuationHandler,
	registerPluginSystemPromptHandler,
} from "./plugin-host-bridge";
import { createPluginRuntimeShared } from "./plugin-shared-modules";

export interface LoadedPlugin {
	id: string;
	name: string;
	version: string;
	/** Fallback locale for `%key%` resolution (ADR-0033). */
	defaultLocale: string;
	/** This plugin's catalogs, keyed by locale code. */
	locales: PluginLocales;
	slots: PluginGlobalSlotContribution[];
	filePreviews: PluginFilePreviewContribution[];
	activityTabs: PluginActivityTabContribution[];
	inputActions: PluginInputActionContribution[];
	cardRenderers: PluginCardRendererContribution[];
	toolCallSlots: PluginToolCallSlotContribution[];
	turnCards: PluginTurnCardContribution[];
	dispose(): Promise<void>;
}

/**
 * Attach + activate a plugin's own activity tab and open the panel, driven
 * directly off the jotai store so it works regardless of whether the activity
 * panel component is currently mounted/expanded. Keyed by the active
 * conversation's cwd (same key the attach records use, see ADR-0026).
 */
function openPluginActivityTab(pluginId: string, tabId: string, width?: number | "max"): void {
	const store = getDefaultStore();
	const cwd = store.get(activeSessionAtom)?.cwd ?? null;
	if (!cwd) {
		console.warn("[plugin] openActivityTab: no active conversation cwd");
		return;
	}
	const key = `${pluginId}:${tabId}`;
	const attached = store.get(attachedPluginTabsAtom);
	const list = attached.get(cwd) ?? [];
	if (!list.includes(key)) {
		const next = new Map(attached);
		next.set(cwd, [...list, key]);
		store.set(attachedPluginTabsAtom, next);
	}
	const active = new Map(store.get(activityPanelTabByProjectAtom));
	active.set(cwd, `plugin:${key}` as ActivityTabKey);
	store.set(activityPanelTabByProjectAtom, active);
	store.set(activityPanelOpenAtom, true);
	if (width != null) store.set(setActivityPanelWidthAtom, width);
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
		shared: createPluginRuntimeShared(),
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

function debugPluginAgent(message: string, data?: Record<string, unknown>): void {
	console.info(`[plugin-agent] ${message}${data ? ` ${JSON.stringify(data)}` : ""}`);
}

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
		writeFile: (filePath, content, encoding) => {
			permissions.require("fs.write");
			return window.vetta.fs.writeFile(filePath, content, encoding);
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

function createSettingsApi(
	plugin: InstalledPlugin,
	initial: Record<string, unknown>,
	disposers: Array<() => void>,
): PluginSettingsApi {
	let values = initial;
	const listeners = new Set<(values: Record<string, unknown>) => void>();
	const unsub = window.vetta.plugins.onSettingsChanged((payload) => {
		if (payload.pluginId !== plugin.id) return;
		values = payload.values;
		for (const listener of listeners) listener(values);
	});
	disposers.push(() => {
		unsub();
		listeners.clear();
	});
	return {
		get<T = unknown>(key: string): T | undefined {
			return values[key] as T | undefined;
		},
		getAll(): Record<string, unknown> {
			return { ...values };
		},
		onChange(listener: (values: Record<string, unknown>) => void): Disposable {
			listeners.add(listener);
			return { dispose: () => listeners.delete(listener) };
		},
	};
}

function createImagesApi(plugin: InstalledPlugin): PluginImagesApi {
	const guard = (): void => createPermissionApi(plugin).require("images.generate");
	return {
		generate: (input) => {
			guard();
			return window.vetta.plugins.generateImage(plugin.id, input);
		},
		edit: (input) => {
			guard();
			return window.vetta.plugins.editImage(plugin.id, input);
		},
		lineage: (imageId) => {
			guard();
			return window.vetta.plugins.imageLineage(plugin.id, imageId);
		},
		sessionLineages: (sessionId) => {
			guard();
			return window.vetta.plugins.sessionLineages(plugin.id, sessionId);
		},
	};
}

function createI18nApi(plugin: InstalledPlugin): PluginI18nApi {
	const store = getDefaultStore();
	return {
		get locale(): string {
			return store.get(languageAtom);
		},
		t: (key, params) => resolveCatalogKey(key, plugin.locales, store.get(languageAtom), plugin.defaultLocale, params),
		onChange: (listener) => {
			const unsub = store.sub(languageAtom, () => listener(store.get(languageAtom)));
			return { dispose: unsub };
		},
	};
}

function createCommandApi(plugin: InstalledPlugin): PluginCommandApi {
	const permissions = createPermissionApi(plugin);
	return {
		run: (file, args, options) => {
			permissions.require("agent.command.run");
			if (typeof file !== "string" || file.trim().length === 0) {
				throw new Error("Command file is required");
			}
			if (!plugin.declaredCommands.includes(file)) {
				throw new Error(`Plugin ${plugin.id} command not declared: ${file}`);
			}
			if (!plugin.grantedCommandNames.includes(file)) {
				// User disabled this command — intercept and notify (with a jump to settings).
				showToast({
					variant: "warning",
					title: "命令已禁用",
					message: `「${plugin.name}」尝试执行 ${file}，但你已在插件设置里关闭它。`,
					action: {
						label: "前往设置",
						onClick: () => {
							void router.navigate({
								to: "/settings/$tab",
								params: { tab: "plugins" },
								search: { section: `plugin-${plugin.id}` },
							});
						},
					},
				});
				throw new Error(`Plugin ${plugin.id} command disabled by user: ${file}`);
			}
			return window.vetta.plugins.runCommand(plugin.id, file, args ?? [], options);
		},
	};
}

function createContext(
	plugin: InstalledPlugin,
	slots: PluginGlobalSlotContribution[],
	filePreviews: PluginFilePreviewContribution[],
	activityTabs: PluginActivityTabContribution[],
	inputActions: PluginInputActionContribution[],
	cardRenderers: PluginCardRendererContribution[],
	toolCallSlots: PluginToolCallSlotContribution[],
	turnCards: PluginTurnCardContribution[],
	settingsApi: PluginSettingsApi,
	onChanged: () => void,
	pendingAgentRegistrations: Promise<void>[],
	activationId: string,
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
			scope_use: contribution.scope_use,
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
	const registerInputAction = (contribution: PluginInputActionContribution): Disposable => {
		createPermissionApi(plugin).require("ui.slot.input-action");
		if (typeof contribution.id !== "string" || contribution.id.trim().length === 0) {
			throw new Error("Input action id is required");
		}
		if (typeof contribution.label !== "string" || contribution.label.trim().length === 0) {
			throw new Error("Input action label is required");
		}
		const userOnToggle = contribution.onToggle;
		const hardIsolation = contribution.hardIsolation === true;
		if (hardIsolation) {
			// Register mode gate immediately so agent contributions stay stripped until toggle on (ADR-0041).
			void window.vetta.plugins.registerModeGate(plugin.id);
		}
		const normalized: PluginInputActionContribution = {
			id: `${plugin.id}:${contribution.id}`,
			label: contribution.label,
			icon: contribution.icon,
			defaultActive: contribution.defaultActive,
			requiresActiveTool: contribution.requiresActiveTool,
			scope_use: contribution.scope_use,
			hardIsolation,
			onToggle: (active) => {
				const veto = userOnToggle?.(active);
				if (veto === false) return false;
				if (hardIsolation) {
					void window.vetta.plugins.setContributionMode(plugin.id, active);
				}
			},
			decoratePrompt: contribution.decoratePrompt,
		};
		inputActions.push(normalized);
		onChanged();
		return {
			dispose: () => {
				const index = inputActions.findIndex((action) => action.id === normalized.id);
				if (index >= 0) inputActions.splice(index, 1);
				if (hardIsolation) {
					void window.vetta.plugins.setContributionMode(plugin.id, false);
				}
				onChanged();
			},
		};
	};
	const registerCardRenderer = (contribution: PluginCardRendererContribution): Disposable => {
		createPermissionApi(plugin).require("ui.slot.message");
		if (typeof contribution.type !== "string" || contribution.type.trim().length === 0) {
			throw new Error("Card renderer type is required");
		}
		if (typeof contribution.component !== "function" && typeof contribution.component !== "object") {
			throw new Error("Card renderer component is invalid");
		}
		// The `type` is the plugin-owned, globally-unique key both the renderer and
		// the descriptor (from a tool's details.cards) agree on — NOT namespaced by
		// the host, unlike slot ids. The plugin is responsible for uniqueness.
		const normalized: PluginCardRendererContribution = {
			type: contribution.type,
			component: contribution.component,
			title: contribution.title,
			icon: contribution.icon,
			pendingFor: contribution.pendingFor,
		};
		cardRenderers.push(normalized);
		onChanged();
		return {
			dispose: () => {
				const index = cardRenderers.findIndex((renderer) => renderer.type === normalized.type);
				if (index >= 0) cardRenderers.splice(index, 1);
				onChanged();
			},
		};
	};
	const registerToolCallSlot = (contribution: PluginToolCallSlotContribution): Disposable => {
		createPermissionApi(plugin).require("ui.slot.tool-call");
		if (typeof contribution.id !== "string" || contribution.id.trim().length === 0) {
			throw new Error("Tool-call slot id is required");
		}
		if (typeof contribution.toolName !== "string" || contribution.toolName.trim().length === 0) {
			throw new Error("Tool-call slot toolName is required");
		}
		if (typeof contribution.component !== "function" && typeof contribution.component !== "object") {
			throw new Error("Tool-call slot component is invalid");
		}
		const normalized: PluginToolCallSlotContribution = {
			id: `${plugin.id}:${contribution.id}`,
			toolName: contribution.toolName.trim(),
			component: contribution.component,
		};
		toolCallSlots.push(normalized);
		onChanged();
		return {
			dispose: () => {
				const index = toolCallSlots.findIndex((slot) => slot.id === normalized.id);
				if (index >= 0) toolCallSlots.splice(index, 1);
				onChanged();
			},
		};
	};
	const registerTurnCard = (contribution: PluginTurnCardContribution): Disposable => {
		createPermissionApi(plugin).require("ui.slot.turn-card");
		if (typeof contribution.id !== "string" || contribution.id.trim().length === 0) {
			throw new Error("Turn card id is required");
		}
		if (typeof contribution.component !== "function" && typeof contribution.component !== "object") {
			throw new Error("Turn card component is invalid");
		}
		const normalized: PluginTurnCardContribution = {
			id: `${plugin.id}:${contribution.id}`,
			component: contribution.component,
			scope_use: contribution.scope_use,
		};
		turnCards.push(normalized);
		onChanged();
		return {
			dispose: () => {
				const index = turnCards.findIndex((card) => card.id === normalized.id);
				if (index >= 0) turnCards.splice(index, 1);
				onChanged();
			},
		};
	};
	const openActivityTab = (tabId: string, options?: PluginOpenActivityTabOptions): void => {
		createPermissionApi(plugin).require("ui.slot.activity-tab");
		if (typeof tabId !== "string" || tabId.trim().length === 0) {
			throw new Error("Activity tab id is required");
		}
		openPluginActivityTab(plugin.id, tabId, options?.width);
	};
	const setEditImageAttachment = (ref: PluginImageRef | null): void => {
		createPermissionApi(plugin).require("ui.slot.input-action");
		const store = getDefaultStore();
		store.set(editImageAttachmentAtom, ref ?? null);
		// Attaching an image to edit implies image intent: activate this plugin's
		// input action(s) so the 图像生成 toggle reflects active and the turn carries
		// imageMode (soft intent amplifier; tools are also available without the toggle).
		if (ref) {
			const myActionIds = store
				.get(pluginInputActionsAtom)
				.filter((action) => action.pluginId === plugin.id)
				.map((action) => action.actionId);
			if (myActionIds.length > 0) {
				store.set(activeInputActionIdsAtom, (prev) => {
					const next = new Set(prev);
					for (const id of myActionIds) next.add(id);
					return next;
				});
			}
		}
	};
	const previewImage = (ref: PluginImageRef, group?: PluginImageRef[]): void => {
		createPermissionApi(plugin).require("ui.slot.message");
		const toItem = (r: PluginImageRef) => {
			const ext = (r.mimeType ?? "image/png").split("/")[1] ?? "png";
			return { name: `${r.id}.${ext}`, url: r.url, kind: "image" as const, mime: r.mimeType };
		};
		// 提供图片组（且多于一张）时以图片组形态打开，起始定位到 ref；否则单图
		const images = (group ?? []).filter((r) => r.url);
		if (images.length > 1) {
			const index = Math.max(
				0,
				images.findIndex((r) => r.id === ref.id),
			);
			getDefaultStore().set(filePreviewAtom, { items: images.map(toItem), index });
		} else {
			getDefaultStore().set(filePreviewAtom, toItem(ref));
		}
	};
	const openPluginSettings = (): void => {
		// Host owns navigation; jump to the settings tab + this plugin's section
		// (existing `?section=plugin-<id>` deep-link scrolls + highlights it).
		void router.navigate({
			to: "/settings/$tab",
			params: { tab: "plugins" },
			search: { section: `plugin-${plugin.id}` },
		});
	};
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
			registerInputAction,
			registerCardRenderer,
			registerToolCallSlot,
			registerTurnCard,
			openActivityTab,
			setEditImageAttachment,
			previewImage,
			openPluginSettings,
		},
		conversation,
		fs,
		command: createCommandApi(plugin),
		agent: {
			registerTool: (registration) => {
				debugPluginAgent("renderer registerTool requested", {
					pluginId: plugin.id,
					toolId: typeof registration.id === "string" ? registration.id.trim() : "(invalid)",
					hasRegisterPermission: hasPermission(plugin, "agent.tools.register"),
					hasExecutePermission: hasPermission(plugin, "agent.toolHandler.execute"),
					activationId,
				});
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
				const toolName = registration.name?.trim() || toolId;
				const handlerId = `${toolId}:${crypto.randomUUID()}`;
				const handlerHandle = registerPluginAgentToolHandler({
					pluginId: plugin.id,
					toolId,
					handlerId,
					handler: registration.handler as PluginAgentToolHandler,
					api: { fs, conversation },
				});
				const registrationPromise = window.vetta.plugins
					.registerAgentTool(plugin.id, {
						id: toolId,
						name: toolName,
						label: registration.label,
						description: registration.description,
						parameters: registration.parameters as Record<string, unknown>,
						handlerId,
						activationId,
						timeoutMs: registration.timeoutMs,
						scope_use: registration.scope_use,
						requires: registration.requires,
						context: registration.context,
					})
					.then(() => {
						debugPluginAgent("renderer registerTool completed", {
							pluginId: plugin.id,
							toolId,
							toolName,
							handlerId,
							activationId,
						});
					})
					.catch((error: Error) => {
						// Do not fail the whole plugin load — UI contributions
						// (activity tabs, slots) should still activate.
						handlerHandle.dispose();
						console.error(`Plugin ${plugin.id} failed to register agent tool ${toolId}`, error);
					});
				pendingAgentRegistrations.push(registrationPromise);
				return {
					dispose: () => {
						handlerHandle.dispose();
						void window.vetta.plugins.unregisterAgentTool(plugin.id, toolId, activationId);
					},
				};
			},
			registerContinuationProvider: (registration) => {
				createPermissionApi(plugin).require("agent.continuation.register");
				if (typeof registration.id !== "string" || registration.id.trim().length === 0) {
					throw new Error("Continuation provider id is required");
				}
				if (typeof registration.handler !== "function") {
					throw new Error("Continuation provider handler is required");
				}
				const providerId = registration.id.trim();
				const handlerId = `${providerId}:${crypto.randomUUID()}`;
				const handlerHandle = registerPluginContinuationHandler({
					pluginId: plugin.id,
					handlerId,
					handler: registration.handler,
					api: { fs, conversation },
				});
				const registrationPromise = window.vetta.plugins
					.registerContinuationProvider(plugin.id, {
						id: providerId,
						handlerId,
						activationId,
						timeoutMs: registration.timeoutMs,
						context: registration.context,
					})
					.catch((error: Error) => {
						handlerHandle.dispose();
						throw error;
					});
				pendingAgentRegistrations.push(registrationPromise);
				return {
					dispose: () => {
						handlerHandle.dispose();
						void window.vetta.plugins.unregisterContinuationProvider(plugin.id, providerId, activationId);
					},
				};
			},
			registerSystemPromptProvider: (registration) => {
				if (
					!hasPermission(plugin, "agent.systemPrompt.write") &&
					!hasPermission(plugin, "agent.systemPrompt.fullControl")
				) {
					throw new Error(`Plugin permission denied: agent.systemPrompt.write`);
				}
				if (typeof registration.id !== "string" || registration.id.trim().length === 0) {
					throw new Error("System prompt provider id is required");
				}
				if (typeof registration.handler !== "function") {
					throw new Error("System prompt provider handler is required");
				}
				const providerId = registration.id.trim();
				const handlerId = `${providerId}:${crypto.randomUUID()}`;
				const handlerHandle = registerPluginSystemPromptHandler({
					pluginId: plugin.id,
					handlerId,
					handler: registration.handler,
					api: { fs, conversation },
				});
				const registrationPromise = window.vetta.plugins
					.registerSystemPromptProvider(plugin.id, {
						id: providerId,
						handlerId,
						activationId,
						timeoutMs: registration.timeoutMs,
						context: registration.context,
					})
					.catch((error: Error) => {
						handlerHandle.dispose();
						throw error;
					});
				pendingAgentRegistrations.push(registrationPromise);
				return {
					dispose: () => {
						handlerHandle.dispose();
						void window.vetta.plugins.unregisterSystemPromptProvider(plugin.id, providerId, activationId);
					},
				};
			},
		},
		images: createImagesApi(plugin),
		settings: settingsApi,
		i18n: createI18nApi(plugin),
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
	const activationId = crypto.randomUUID();
	debugPluginAgent("load start", {
		pluginId: plugin.id,
		version: plugin.activeVersion,
		runtime: plugin.runtime,
		source: plugin.source,
		activationId,
	});
	const slots: PluginGlobalSlotContribution[] = [];
	const filePreviews: PluginFilePreviewContribution[] = [];
	const activityTabs: PluginActivityTabContribution[] = [];
	const inputActions: PluginInputActionContribution[] = [];
	const cardRenderers: PluginCardRendererContribution[] = [];
	const toolCallSlots: PluginToolCallSlotContribution[] = [];
	const turnCards: PluginTurnCardContribution[] = [];
	const disposers: Array<() => void> = [];
	const styleHandle = loadPluginStyles(plugin);
	await window.vetta.plugins.beginAgentContributionsLoad(plugin.id, activationId);
	debugPluginAgent("began dynamic agent contribution activation", { pluginId: plugin.id, activationId });
	await assertPluginEntryFetchable(plugin);
	const module = await loadPluginModule(plugin);
	const definition = normalizePluginDefinition(module);
	const initialSettings = plugin.settingsSchema?.length
		? await window.vetta.plugins.getSettings(plugin.id).catch(() => ({}))
		: {};
	const settingsApi = createSettingsApi(plugin, initialSettings, disposers);
	const pendingAgentRegistrations: Promise<void>[] = [];
	const context = createContext(
		plugin,
		slots,
		filePreviews,
		activityTabs,
		inputActions,
		cardRenderers,
		toolCallSlots,
		turnCards,
		settingsApi,
		onChanged,
		pendingAgentRegistrations,
		activationId,
	);
	await definition.activate(context);
	debugPluginAgent("activate resolved", {
		pluginId: plugin.id,
		pendingAgentRegistrations: pendingAgentRegistrations.length,
		activationId,
	});
	await Promise.all(pendingAgentRegistrations);
	debugPluginAgent("load complete", {
		pluginId: plugin.id,
		agentContributionsRegistered: pendingAgentRegistrations.length,
		globalSlots: slots.length,
		activityTabs: activityTabs.length,
		cardRenderers: cardRenderers.length,
		toolCallSlots: toolCallSlots.length,
		activationId,
	});
	return {
		id: plugin.id,
		name: plugin.name,
		version: plugin.activeVersion,
		defaultLocale: plugin.defaultLocale,
		locales: plugin.locales,
		slots,
		filePreviews,
		activityTabs,
		inputActions,
		cardRenderers,
		toolCallSlots,
		turnCards,
		dispose: async () => {
			debugPluginAgent("dispose start", { pluginId: plugin.id, activationId });
			await definition.deactivate?.();
			await window.vetta.plugins.clearAgentContributions(plugin.id, activationId);
			debugPluginAgent("cleared dynamic agent contributions on dispose", { pluginId: plugin.id, activationId });
			styleHandle.dispose();
			for (const dispose of disposers) dispose();
			slots.splice(0, slots.length);
			filePreviews.splice(0, filePreviews.length);
			activityTabs.splice(0, activityTabs.length);
			inputActions.splice(0, inputActions.length);
			cardRenderers.splice(0, cardRenderers.length);
			toolCallSlots.splice(0, toolCallSlots.length);
			turnCards.splice(0, turnCards.length);
			onChanged();
		},
	};
}
