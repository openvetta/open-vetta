import { bindCapability, type CapabilityRegistry } from "@vetta/capability-runtime";
import {
	CAPABILITY_ERROR_CODES,
	CapabilityError,
	type CapabilityJsonMap,
	type CapabilityJsonValue,
	type Disposable,
	FOUNDATION_FILESYSTEM_CAPABILITIES,
	FOUNDATION_STORAGE_CAPABILITIES,
} from "@vetta/capability-sdk";
import { themeIdFromStorageCapabilityNamespace } from "@vetta/capability-sdk/internal/theme-adapter";
import {
	createFilesystemDirectory,
	deleteFilesystemPath,
	listFilesystemFilesRecursive,
	moveFilesystemPath,
	readFilesystemDirectory,
	readFilesystemFile,
	renameFilesystemPath,
	statFilesystemPath,
	writeFilesystemFile,
} from "../filesystem/filesystem-service.js";
import {
	clearThemeStorage,
	getThemeStorageData,
	removeThemeStorageValue,
	setThemeStorageValue,
} from "../themes/theme-data-store.js";

const FOUNDATION_STORAGE_PROVIDER_OWNER = "vetta.foundation.storage";
const FOUNDATION_FILESYSTEM_PROVIDER_OWNER = "vetta.foundation.filesystem";

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
	return {
		dispose: () => {
			filesystemRegistration.dispose();
			storageRegistration.dispose();
		},
	};
}
