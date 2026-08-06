import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createLimiter } from "../src/concurrency/index.js";
import * as config from "../src/config.js";
import { createExtensionEventBus } from "../src/extensions/runtime/event-bus.js";
import * as root from "../src/index.js";
import { createAgentCliBootstrap, createCodingAgentHostBootstrap } from "../src/public-api/bootstrap.js";
import { runCodingAgentCliControl } from "../src/public-api/cli-control.js";
import { createCodingAgentHtmlExportRuntime } from "../src/public-api/export-html.js";
import { ExtensionRunner } from "../src/public-api/extensions.js";
import {
	createCodingAgentHistoricalSessionCatalog,
	createCodingAgentHistoricalSessionFileHistoryReader,
	migrateCodingAgentHistoricalSession,
} from "../src/public-api/historical-sessions.js";
import {
	createCodingAgentModelRuntime,
	createCodingAgentSharedModelController,
	AuthStorage as HostAuthStorage,
	SettingsRuntime as HostSettingsRuntime,
} from "../src/public-api/host-services.js";
import { VETTA_CLI_GUIDANCE } from "../src/public-api/product-prompt.js";
import { ALL_SCENARIOS, PERSONAS } from "../src/public-api/profile.js";
import { createCodingAgentSessionResourceRuntime } from "../src/public-api/resources.js";
import {
	GREENFIELD_FULL_RPC_PROFILE,
	GREENFIELD_IM_RPC_PROFILE,
	runRpcModeWithCapabilities,
} from "../src/public-api/rpc.js";
import {
	createCodingAgentRuntimeExtensionCommandHost,
	createCodingAgentSessionCapabilityHost,
	createCodingAgentTurnExecutor,
} from "../src/public-api/runtime.js";
import { createCodingAgentSession } from "../src/public-api/sdk.js";
import { SettingsRuntime } from "../src/public-api/settings.js";

describe("coding-agent public subpaths", () => {
	it("forwards existing root APIs without wrapping or replacing behavior", () => {
		expect(createAgentCliBootstrap).toBe(root.createAgentCliBootstrap);
		expect(createCodingAgentHostBootstrap).toBe(root.createCodingAgentHostBootstrap);
		expect(runRpcModeWithCapabilities).toBe(root.runRpcModeWithCapabilities);
		expect(GREENFIELD_IM_RPC_PROFILE).toBe(root.GREENFIELD_IM_RPC_PROFILE);
		expect(GREENFIELD_FULL_RPC_PROFILE).toBe(root.GREENFIELD_FULL_RPC_PROFILE);
		expect(ALL_SCENARIOS).toBe(root.ALL_SCENARIOS);
		expect(PERSONAS).toBe(root.PERSONAS);
		expect(config.getAgentDir).toBe(root.getAgentDir);
		expect(createCodingAgentSessionResourceRuntime).toBeTypeOf("function");
		expect(Reflect.has(root, "DefaultResourceLoader")).toBe(false);
		expect(createLimiter).toBe(root.createLimiter);
		expect(createExtensionEventBus).toBe(root.createEventBus);
		expect(HostAuthStorage).toBe(root.AuthStorage);
		expect(createCodingAgentModelRuntime).toBeTypeOf("function");
		expect(createCodingAgentSharedModelController).toBeTypeOf("function");
		expect(Reflect.has(root, "ModelRegistry")).toBe(false);
		expect(HostSettingsRuntime).toBe(SettingsRuntime);
		expect(ExtensionRunner).toBe(root.ExtensionRunner);
		expect(runCodingAgentCliControl).toBeTypeOf("function");
		expect(createCodingAgentHtmlExportRuntime).toBeTypeOf("function");
		expect(createCodingAgentHistoricalSessionCatalog).toBeTypeOf("function");
		expect(createCodingAgentHistoricalSessionFileHistoryReader).toBeTypeOf("function");
		expect(migrateCodingAgentHistoricalSession).toBeTypeOf("function");
		expect(createCodingAgentRuntimeExtensionCommandHost).toBeTypeOf("function");
		expect(createCodingAgentSessionCapabilityHost).toBeTypeOf("function");
		expect(createCodingAgentTurnExecutor).toBeTypeOf("function");
		expect(createCodingAgentSession).toBeTypeOf("function");
		expect(Reflect.has(root, "createAgentSession")).toBe(false);
		expect(Reflect.has(root, "SettingsRuntime")).toBe(false);
		expect(VETTA_CLI_GUIDANCE).toContain("vetta action search");
	});

	it("publishes the explicit package export targets", () => {
		const manifest: unknown = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
		const exports = Reflect.get(manifest as object, "exports");
		expect(exports).toMatchObject({
			"./bootstrap": {
				types: "./dist/public-api/bootstrap.d.ts",
				import: "./dist/public-api/bootstrap.js",
			},
			"./cli-control": {
				types: "./dist/public-api/cli-control.d.ts",
				import: "./dist/public-api/cli-control.js",
			},
			"./config": {
				types: "./dist/config.d.ts",
				import: "./dist/config.js",
			},
			"./configuration": {
				types: "./dist/configuration/index.d.ts",
				import: "./dist/configuration/index.js",
			},
			"./concurrency": {
				types: "./dist/concurrency/index.d.ts",
				import: "./dist/concurrency/index.js",
			},
			"./hooks": {
				types: "./dist/public-api/hooks.d.ts",
				import: "./dist/public-api/hooks.js",
			},
			"./extensions": {
				types: "./dist/public-api/extensions.d.ts",
				import: "./dist/public-api/extensions.js",
			},
			"./export-html": {
				types: "./dist/public-api/export-html.d.ts",
				import: "./dist/public-api/export-html.js",
			},
			"./host-services": {
				types: "./dist/public-api/host-services.d.ts",
				import: "./dist/public-api/host-services.js",
			},
			"./historical-sessions": {
				types: "./dist/public-api/historical-sessions.d.ts",
				import: "./dist/public-api/historical-sessions.js",
			},
			"./profile": {
				types: "./dist/public-api/profile.d.ts",
				import: "./dist/public-api/profile.js",
			},
			"./product-prompt": {
				types: "./dist/public-api/product-prompt.d.ts",
				import: "./dist/public-api/product-prompt.js",
			},
			"./resources": {
				types: "./dist/public-api/resources.d.ts",
				import: "./dist/public-api/resources.js",
			},
			"./runtime": {
				types: "./dist/public-api/runtime.d.ts",
				import: "./dist/public-api/runtime.js",
			},
			"./rpc": {
				types: "./dist/public-api/rpc.d.ts",
				import: "./dist/public-api/rpc.js",
			},
			"./sdk": {
				types: "./dist/public-api/sdk.d.ts",
				import: "./dist/public-api/sdk.js",
			},
			"./settings": {
				types: "./dist/public-api/settings.d.ts",
				import: "./dist/public-api/settings.js",
			},
		});
		expect(Reflect.has(exports as object, "./core/settings-manager.js")).toBe(false);
		expect(Reflect.has(exports as object, "./knowledge")).toBe(false);
		expect(Object.keys(exports).filter((key) => key.startsWith("./compat/"))).toEqual([]);
		expect(Object.keys(exports).filter((key) => key.startsWith("./legacy/"))).toEqual([]);
	});
});
