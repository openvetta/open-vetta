import { bindCapability, type CapabilityRegistry } from "@vetta/capability-runtime";
import {
	CAPABILITY_ERROR_CODES,
	CapabilityError,
	type CapabilityJsonMap,
	type CapabilityJsonValue,
	type Disposable,
	FOUNDATION_STORAGE_CAPABILITIES,
} from "@vetta/capability-sdk";
import { themeIdFromStorageCapabilityNamespace } from "@vetta/capability-sdk/internal/theme-adapter";
import {
	clearThemeStorage,
	getThemeStorageData,
	removeThemeStorageValue,
	setThemeStorageValue,
} from "../themes/theme-data-store.js";

const FOUNDATION_STORAGE_PROVIDER_OWNER = "vetta.foundation.storage";

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
		throw new CapabilityError(CAPABILITY_ERROR_CODES.ABORTED, "Storage capability invocation was aborted");
	}
}

export function registerDesktopFoundationProviders(registry: CapabilityRegistry): Disposable {
	return registry.registerOwner(FOUNDATION_STORAGE_PROVIDER_OWNER, [
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
}
