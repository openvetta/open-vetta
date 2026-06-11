declare module "vetta-host://react" {
	import type * as React from "react";

	export { default } from "react";
	export const useMemo: typeof React.useMemo;
	export const useState: typeof React.useState;
}

declare module "vetta-host://plugin-sdk" {
	import type { ComponentType } from "react";

	export type PluginPermission =
		| "ui.slot.global"
		| "agent.session.read"
		| "agent.session.write"
		| "agent.command.run"
		| "fs.read"
		| "fs.write"
		| "network.fetch"
		| "settings.read"
		| "settings.write";

	export interface Disposable {
		dispose(): void;
	}

	export interface PluginGlobalSlotContribution {
		id: string;
		component: ComponentType;
	}

	export interface PluginContext {
		plugin: {
			id: string;
			version: string;
		};
		permissions: {
			has(permission: PluginPermission): boolean;
			require(permission: PluginPermission): void;
		};
		ui: {
			registerGlobalSlot(contribution: PluginGlobalSlotContribution): Disposable;
		};
	}

	export interface PluginDefinition {
		activate(ctx: PluginContext): void | Promise<void>;
		deactivate?(): void | Promise<void>;
	}

	export function definePlugin(plugin: PluginDefinition): PluginDefinition;
}
