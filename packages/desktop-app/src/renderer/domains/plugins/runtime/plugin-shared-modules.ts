import type { ModuleFederation } from "@module-federation/enhanced/runtime";
import * as pluginSdk from "@vetta/plugin-sdk";
import * as React from "react";
import * as jsxDevRuntime from "react/jsx-dev-runtime";
import * as jsxRuntime from "react/jsx-runtime";
import * as ReactDom from "react-dom";

export interface PluginSharedModule {
	module: unknown;
	version: string;
	singleton: boolean;
	requiredVersion: string | false;
}

export const pluginSharedModules = {
	"@vetta/plugin-sdk": {
		module: pluginSdk,
		version: "1.0.0",
		singleton: true,
		requiredVersion: false,
	},
	react: {
		module: React,
		version: React.version,
		singleton: true,
		requiredVersion: false,
	},
	"react-dom": {
		module: ReactDom,
		version: ReactDom.version,
		singleton: true,
		requiredVersion: false,
	},
	"react/jsx-runtime": {
		module: jsxRuntime,
		version: React.version,
		singleton: true,
		requiredVersion: false,
	},
	"react/jsx-dev-runtime": {
		module: jsxDevRuntime,
		version: React.version,
		singleton: true,
		requiredVersion: false,
	},
} satisfies Record<string, PluginSharedModule>;

type ModuleFederationShared = Parameters<typeof ModuleFederation.prototype.initOptions>[0]["shared"];

export function createPluginRuntimeShared(): NonNullable<ModuleFederationShared> {
	return Object.fromEntries(
		Object.entries(pluginSharedModules).map(([name, shared]) => [
			name,
			{
				version: shared.version,
				lib: () => shared.module,
				shareConfig: {
					singleton: shared.singleton,
					requiredVersion: shared.requiredVersion,
				},
			},
		]),
	) as NonNullable<ModuleFederationShared>;
}

export function installViteFederationSharedCache(share: Record<string, unknown>): void {
	for (const [name, shared] of Object.entries(pluginSharedModules)) {
		share[name] = shared.module;
	}
}

export const pluginHostShimModules = {
	React,
	ReactDom,
	jsxRuntime,
	jsxDevRuntime,
	pluginSdk,
};
