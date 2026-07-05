import type { ModuleFederation } from "@module-federation/enhanced/runtime";
import * as themeSdk from "@vetta/theme-sdk";
import * as themeUi from "@vetta/theme-ui";
import * as vettaUi from "@vetta/ui";
import * as React from "react";
import * as jsxDevRuntime from "react/jsx-dev-runtime";
import * as jsxRuntime from "react/jsx-runtime";
import * as ReactDom from "react-dom";

type ModuleFederationShared = Parameters<typeof ModuleFederation.prototype.initOptions>[0]["shared"];

const sharedModules = {
	"@vetta/theme-sdk": { module: themeSdk, version: "0.1.0" },
	"@vetta/theme-ui": { module: themeUi, version: "0.1.0" },
	"@vetta/ui": { module: vettaUi, version: "0.1.0" },
	react: { module: React, version: React.version },
	"react-dom": { module: ReactDom, version: ReactDom.version },
	"react/jsx-runtime": { module: jsxRuntime, version: React.version },
	"react/jsx-dev-runtime": { module: jsxDevRuntime, version: React.version },
};

export function createThemeRuntimeShared(): NonNullable<ModuleFederationShared> {
	return Object.fromEntries(
		Object.entries(sharedModules).map(([name, shared]) => [
			name,
			{
				version: shared.version,
				lib: () => shared.module,
				shareConfig: { singleton: true, requiredVersion: false },
			},
		]),
	) as NonNullable<ModuleFederationShared>;
}
