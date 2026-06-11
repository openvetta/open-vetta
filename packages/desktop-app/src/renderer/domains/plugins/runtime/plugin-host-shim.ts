import * as pluginSdk from "@vetta/plugin-sdk";
import * as React from "react";
import * as jsxDevRuntime from "react/jsx-dev-runtime";
import * as jsxRuntime from "react/jsx-runtime";

declare global {
	var __VETTA_PLUGIN_HOST__:
		| {
				React: typeof React;
				jsxRuntime: typeof jsxRuntime;
				jsxDevRuntime: typeof jsxDevRuntime;
				pluginSdk: typeof pluginSdk;
		  }
		| undefined;
}

export function installPluginHostShim(): void {
	globalThis.__VETTA_PLUGIN_HOST__ = {
		React,
		jsxRuntime,
		jsxDevRuntime,
		pluginSdk,
	};
}
