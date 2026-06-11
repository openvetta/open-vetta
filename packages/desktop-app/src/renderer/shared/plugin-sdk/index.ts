import type { PluginPermission } from "@preload/api";
import type { ComponentType } from "react";

export interface Disposable {
	dispose(): void;
}

export interface PluginGlobalSlotContribution {
	id: string;
	component: ComponentType;
}

export interface PluginUiApi {
	registerGlobalSlot(contribution: PluginGlobalSlotContribution): Disposable;
}

export interface PluginPermissionApi {
	has(permission: PluginPermission): boolean;
	require(permission: PluginPermission): void;
}

export interface PluginContext {
	plugin: {
		id: string;
		version: string;
	};
	permissions: PluginPermissionApi;
	ui: PluginUiApi;
}

export interface PluginDefinition {
	activate(ctx: PluginContext): void | Promise<void>;
	deactivate?(): void | Promise<void>;
}

export function definePlugin(plugin: PluginDefinition): PluginDefinition {
	return plugin;
}
