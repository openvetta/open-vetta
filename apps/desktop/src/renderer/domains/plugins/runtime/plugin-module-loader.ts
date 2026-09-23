import {
	createInstance,
	type ModuleFederation,
	type ModuleFederationRuntimePlugin,
} from "@module-federation/enhanced/runtime";
import type { InstalledPlugin } from "@preload/api";
import type { PluginDefinition } from "@vetta-org/plugin-sdk";
import { extractPluginReloadToken, normalizePluginModule } from "./plugin-module-contract";
import { createPluginRuntimeShared } from "./plugin-shared-modules";

let moduleFederationHost: ModuleFederation | undefined;
const registeredRemotes = new Map<string, { entry: string }>();
const remoteReloadTokens = new Map<string, string>();
const pluginDevRuntimePromises = new Map<string, Promise<void>>();

interface PluginDevModuleGlobal {
	__VETTA_PLUGIN_DEV_MODULES__?: Map<string, unknown>;
}

async function ensurePluginDevRuntime(plugin: InstalledPlugin): Promise<void> {
	const origin = plugin.devWatch?.origin;
	if (!origin) return;
	let pending = pluginDevRuntimePromises.get(origin);
	if (!pending) {
		pending = import(/* @vite-ignore */ `${origin}/@vetta-plugin-dev-preamble`)
			.then(() => undefined)
			.catch((error: unknown) => {
				pluginDevRuntimePromises.delete(origin);
				throw error;
			});
		pluginDevRuntimePromises.set(origin, pending);
	}
	await pending;
}

function getLatestPluginDevModule(pluginId: string): unknown {
	return (globalThis as typeof globalThis & PluginDevModuleGlobal).__VETTA_PLUGIN_DEV_MODULES__?.get(pluginId);
}

/** Propagates the manifest reload token to the federation remote entry URL. */
function createReloadBustPlugin(): ModuleFederationRuntimePlugin {
	return {
		name: "vetta-reload-bust",
		afterResolve(args) {
			const token = remoteReloadTokens.get(args.remoteInfo.name);
			if (token && args.remoteInfo.entry && !args.remoteInfo.entry.includes("reloadBust=")) {
				const separator = args.remoteInfo.entry.includes("?") ? "&" : "?";
				args.remoteInfo.entry = `${args.remoteInfo.entry}${separator}reloadBust=${encodeURIComponent(token)}`;
			}
			return args;
		},
	};
}

function getModuleFederationHost(): ModuleFederation {
	moduleFederationHost ??= createInstance({
		name: "vetta_plugin_host",
		remotes: [],
		shared: createPluginRuntimeShared(),
		shareStrategy: "loaded-first",
		plugins: [createReloadBustPlugin()],
	});
	return moduleFederationHost;
}

async function assertPluginEntryFetchable(plugin: InstalledPlugin): Promise<void> {
	try {
		const response = await fetch(plugin.entryUrl, { cache: "no-store" });
		if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
		const contentType = response.headers.get("content-type") ?? "";
		if (!contentType.includes("json")) {
			throw new Error(`Unexpected content type: ${contentType || "unknown"}`);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Plugin entry is not fetchable: ${plugin.entryUrl}; ${message}`);
	}
}

/**
 * Remote registration shape.
 * Module Federation treats an alias as a prefix of every other remote name.
 * Plugin id `git` is a prefix of `github_issue_board`, so registering Git after
 * the issue board used to reject the Git plugin and hide its panel.
 * The host loads remotes by remoteName, so the plugin id is not an alias.
 */
export function pluginFederationRemote(plugin: Pick<InstalledPlugin, "entryUrl" | "moduleFederation">): {
	name: string;
	entry: string;
} {
	return { name: plugin.moduleFederation.remoteName, entry: plugin.entryUrl };
}

async function loadPluginModule(plugin: InstalledPlugin): Promise<unknown> {
	const moduleFederation = plugin.moduleFederation;
	await ensurePluginDevRuntime(plugin);
	const host = getModuleFederationHost();
	const remote = pluginFederationRemote(plugin);
	const reloadToken = extractPluginReloadToken(plugin.entryUrl);
	if (reloadToken) remoteReloadTokens.set(remote.name, reloadToken);
	else remoteReloadTokens.delete(remote.name);
	const registeredRemote = registeredRemotes.get(remote.name);
	if (!registeredRemote || registeredRemote.entry !== remote.entry) {
		host.registerRemotes([remote], registeredRemote ? { force: true } : undefined);
		registeredRemotes.set(remote.name, { entry: remote.entry });
	}
	const expose = moduleFederation.expose.replace(/^\.\//, "");
	const loaded = await host.loadRemote<unknown>(`${moduleFederation.remoteName}/${expose}`, { from: "runtime" });
	if (loaded == null) {
		throw new Error(`Module Federation remote returned null: ${moduleFederation.remoteName}/${expose}`);
	}
	return getLatestPluginDevModule(plugin.id) ?? loaded;
}

export async function loadPluginDefinition(plugin: InstalledPlugin): Promise<PluginDefinition> {
	await assertPluginEntryFetchable(plugin);
	return normalizePluginModule(await loadPluginModule(plugin));
}
