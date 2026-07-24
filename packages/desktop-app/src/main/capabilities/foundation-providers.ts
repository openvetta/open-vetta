import { bindCapability, type CapabilityRegistry } from "@vetta/capability-runtime";
import {
	CAPABILITY_ERROR_CODES,
	CapabilityError,
	type CapabilityJsonMap,
	type CapabilityJsonValue,
	type Disposable,
	FOUNDATION_FILESYSTEM_CAPABILITIES,
	FOUNDATION_PLUGIN_NETWORK_CAPABILITIES,
	FOUNDATION_PLUGIN_STORAGE_CAPABILITIES,
	FOUNDATION_STORAGE_CAPABILITIES,
	parseCapabilityJsonValue,
} from "@vetta/capability-sdk";
import { themeIdFromStorageCapabilityNamespace } from "@vetta/capability-sdk/internal/theme-adapter";
import {
	createFilesystemDirectory,
	deleteFilesystemPath,
	listFilesystemFilesRecursive,
	moveFilesystemPath,
	readFilesystemBinaryFile,
	readFilesystemDirectory,
	readFilesystemFile,
	renameFilesystemPath,
	statFilesystemPath,
	writeFilesystemFile,
} from "../filesystem/filesystem-service.js";
import { requestForPlugin } from "../plugins/plugin-network-service.js";
import {
	getPluginBlobRef,
	listPluginFiles,
	putPluginBlob,
	readPluginBlob,
	readPluginFile,
	readPluginJson,
	writePluginFile,
	writePluginJson,
} from "../plugins/plugin-storage-service.js";
import {
	clearThemeStorage,
	getThemeStorageData,
	removeThemeStorageValue,
	setThemeStorageValue,
} from "../themes/theme-data-store.js";

const FOUNDATION_STORAGE_PROVIDER_OWNER = "vetta.foundation.storage";
const FOUNDATION_FILESYSTEM_PROVIDER_OWNER = "vetta.foundation.filesystem";
const FOUNDATION_PLUGIN_PROVIDER_OWNER = "vetta.foundation.plugin";

interface NamespacedStorageBackend {
	clear(namespace: string): Promise<CapabilityJsonMap>;
	getAll(namespace: string): Promise<CapabilityJsonMap>;
	remove(namespace: string, key: string): Promise<CapabilityJsonMap>;
	set(namespace: string, key: string, value: CapabilityJsonValue): Promise<CapabilityJsonMap>;
}

const desktopStorageBackend: NamespacedStorageBackend = {
	async getAll(namespace) {
		return getThemeStorageData(themeIdFromStorageCapabilityNamespace(namespace));
	},
	async set(namespace, key, value) {
		return setThemeStorageValue(themeIdFromStorageCapabilityNamespace(namespace), key, value);
	},
	async remove(namespace, key) {
		return removeThemeStorageValue(themeIdFromStorageCapabilityNamespace(namespace), key);
	},
	async clear(namespace) {
		return clearThemeStorage(themeIdFromStorageCapabilityNamespace(namespace));
	},
};

function assertNotAborted(signal: AbortSignal): void {
	if (signal.aborted) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.ABORTED, "Capability invocation was aborted");
	}
}

function asPayloadRecord(value: CapabilityJsonValue): Record<string, CapabilityJsonValue> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Plugin capability payload must be an object");
	}
	return value;
}

function payloadString(payload: Record<string, CapabilityJsonValue>, field: string): string {
	const value = payload[field];
	if (typeof value !== "string" || value.length === 0) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, `Plugin capability ${field} must be a string`);
	}
	return value;
}

export function registerDesktopFoundationProviders(registry: CapabilityRegistry): Disposable {
	const storageRegistration = registry.registerOwner(FOUNDATION_STORAGE_PROVIDER_OWNER, [
		bindCapability(FOUNDATION_STORAGE_CAPABILITIES.GET_ALL, {
			execute: async ({ namespace }, context) => {
				assertNotAborted(context.signal);
				return desktopStorageBackend.getAll(namespace);
			},
		}),
		bindCapability(FOUNDATION_STORAGE_CAPABILITIES.SET, {
			execute: async ({ namespace, key, value }, context) => {
				assertNotAborted(context.signal);
				return desktopStorageBackend.set(namespace, key, value);
			},
		}),
		bindCapability(FOUNDATION_STORAGE_CAPABILITIES.REMOVE, {
			execute: async ({ namespace, key }, context) => {
				assertNotAborted(context.signal);
				return desktopStorageBackend.remove(namespace, key);
			},
		}),
		bindCapability(FOUNDATION_STORAGE_CAPABILITIES.CLEAR, {
			execute: async ({ namespace }, context) => {
				assertNotAborted(context.signal);
				return desktopStorageBackend.clear(namespace);
			},
		}),
	]);
	const filesystemRegistration = registry.registerOwner(FOUNDATION_FILESYSTEM_PROVIDER_OWNER, [
		bindCapability(FOUNDATION_FILESYSTEM_CAPABILITIES.READ_DIRECTORY, {
			execute: async ({ path }, context) => {
				assertNotAborted(context.signal);
				return readFilesystemDirectory(path);
			},
		}),
		bindCapability(FOUNDATION_FILESYSTEM_CAPABILITIES.READ_FILE, {
			execute: async ({ path }, context) => {
				assertNotAborted(context.signal);
				return readFilesystemFile(path);
			},
		}),
		bindCapability(FOUNDATION_FILESYSTEM_CAPABILITIES.READ_BINARY_FILE, {
			execute: async ({ path }, context) => {
				assertNotAborted(context.signal);
				return readFilesystemBinaryFile(path);
			},
		}),
		bindCapability(FOUNDATION_FILESYSTEM_CAPABILITIES.WRITE_FILE, {
			execute: async ({ path, content, encoding }, context) => {
				assertNotAborted(context.signal);
				await writeFilesystemFile(path, content, encoding);
			},
		}),
		bindCapability(FOUNDATION_FILESYSTEM_CAPABILITIES.STAT, {
			execute: async ({ path }, context) => {
				assertNotAborted(context.signal);
				return statFilesystemPath(path);
			},
		}),
		bindCapability(FOUNDATION_FILESYSTEM_CAPABILITIES.RENAME, {
			execute: async ({ oldPath, newPath }, context) => {
				assertNotAborted(context.signal);
				await renameFilesystemPath(oldPath, newPath);
			},
		}),
		bindCapability(FOUNDATION_FILESYSTEM_CAPABILITIES.DELETE, {
			execute: async ({ path }, context) => {
				assertNotAborted(context.signal);
				await deleteFilesystemPath(path);
			},
		}),
		bindCapability(FOUNDATION_FILESYSTEM_CAPABILITIES.MOVE, {
			execute: async ({ sourcePath, destinationDirectory }, context) => {
				assertNotAborted(context.signal);
				await moveFilesystemPath(sourcePath, destinationDirectory);
			},
		}),
		bindCapability(FOUNDATION_FILESYSTEM_CAPABILITIES.CREATE_DIRECTORY, {
			execute: async ({ path }, context) => {
				assertNotAborted(context.signal);
				await createFilesystemDirectory(path);
			},
		}),
		bindCapability(FOUNDATION_FILESYSTEM_CAPABILITIES.LIST_FILES_RECURSIVE, {
			execute: async ({ path }, context) => {
				assertNotAborted(context.signal);
				return listFilesystemFilesRecursive(path);
			},
		}),
	]);
	const pluginRegistration = registry.registerOwner(FOUNDATION_PLUGIN_PROVIDER_OWNER, [
		bindCapability(FOUNDATION_PLUGIN_NETWORK_CAPABILITIES.REQUEST, {
			execute: async ({ payload }, context) => {
				assertNotAborted(context.signal);
				const response = await requestForPlugin(
					payload as unknown as Parameters<typeof requestForPlugin>[0],
					context.signal,
				);
				return parseCapabilityJsonValue(response);
			},
		}),
		bindCapability(FOUNDATION_PLUGIN_STORAGE_CAPABILITIES.READ, {
			execute: async ({ pluginId, operation, payload }, context) => {
				assertNotAborted(context.signal);
				const input = asPayloadRecord(payload);
				if (operation === "read-json") {
					return (await readPluginJson<CapabilityJsonValue>(pluginId, payloadString(input, "key"))) ?? null;
				}
				if (operation === "list") {
					const prefix = input.prefix;
					if (prefix !== undefined && typeof prefix !== "string") {
						throw new CapabilityError(
							CAPABILITY_ERROR_CODES.INVALID_INPUT,
							"Plugin storage prefix must be a string",
						);
					}
					return listPluginFiles(pluginId, prefix);
				}
				if (operation === "read-file") {
					return (await readPluginFile(pluginId, payloadString(input, "path"))) ?? null;
				}
				if (operation === "read-blob") {
					return parseCapabilityJsonValue((await readPluginBlob(pluginId, payloadString(input, "id"))) ?? null);
				}
				if (operation === "get-blob-ref") {
					return parseCapabilityJsonValue((await getPluginBlobRef(pluginId, payloadString(input, "id"))) ?? null);
				}
				throw new CapabilityError(
					CAPABILITY_ERROR_CODES.INVALID_INPUT,
					`Unknown plugin storage read: ${operation}`,
				);
			},
		}),
		bindCapability(FOUNDATION_PLUGIN_STORAGE_CAPABILITIES.WRITE, {
			execute: async ({ pluginId, operation, payload }, context) => {
				assertNotAborted(context.signal);
				const input = asPayloadRecord(payload);
				if (operation === "write-json") {
					if (!Object.hasOwn(input, "value")) {
						throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Plugin storage value is required");
					}
					await writePluginJson(pluginId, payloadString(input, "key"), input.value);
					return null;
				}
				if (operation === "write-file") {
					await writePluginFile(pluginId, payloadString(input, "path"), payloadString(input, "data"));
					return null;
				}
				if (operation === "put-blob") {
					const id = input.id;
					if (id !== undefined && typeof id !== "string") {
						throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Plugin blob id must be a string");
					}
					const ref = await putPluginBlob(pluginId, {
						...(id === undefined ? {} : { id }),
						data: payloadString(input, "data"),
						mimeType: payloadString(input, "mimeType"),
					});
					return parseCapabilityJsonValue(ref);
				}
				throw new CapabilityError(
					CAPABILITY_ERROR_CODES.INVALID_INPUT,
					`Unknown plugin storage write: ${operation}`,
				);
			},
		}),
	]);
	return {
		dispose: () => {
			pluginRegistration.dispose();
			filesystemRegistration.dispose();
			storageRegistration.dispose();
		},
	};
}
