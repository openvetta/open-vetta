import { installViteFederationSharedCache, pluginHostShimModules } from "./plugin-shared-modules";

interface ModuleFederationModuleCache {
	share: Record<string, unknown>;
	remote: Record<string, unknown>;
}

declare global {
	var __VETTA_PLUGIN_HOST__:
		| {
				React: typeof pluginHostShimModules.React;
				ReactDom: typeof pluginHostShimModules.ReactDom;
				ReactDomClient: typeof pluginHostShimModules.ReactDomClient;
				jsxRuntime: typeof pluginHostShimModules.jsxRuntime;
				jsxDevRuntime: typeof pluginHostShimModules.jsxDevRuntime;
				pluginSdk: typeof pluginHostShimModules.pluginSdk;
		  }
		| undefined;
	var __mf_module_cache__: ModuleFederationModuleCache | undefined;
}

export function installPluginHostShim(): void {
	globalThis.__VETTA_PLUGIN_HOST__ = {
		React: pluginHostShimModules.React,
		ReactDom: pluginHostShimModules.ReactDom,
		ReactDomClient: pluginHostShimModules.ReactDomClient,
		jsxRuntime: pluginHostShimModules.jsxRuntime,
		jsxDevRuntime: pluginHostShimModules.jsxDevRuntime,
		pluginSdk: pluginHostShimModules.pluginSdk,
	};

	if (!globalThis.__mf_module_cache__) {
		globalThis.__mf_module_cache__ = { share: {}, remote: {} };
	}
	const moduleCache = globalThis.__mf_module_cache__;
	moduleCache.share ??= {};
	moduleCache.remote ??= {};
	installViteFederationSharedCache(moduleCache.share);
}
