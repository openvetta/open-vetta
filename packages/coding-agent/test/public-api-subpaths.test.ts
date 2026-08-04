import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as config from "../src/config.js";
import { createLimiter } from "../src/core/concurrency-limit.js";
import * as root from "../src/index.js";
import { createAgentCliBootstrap, createCodingAgentHostBootstrap } from "../src/public-api/bootstrap.js";
import { runCodingAgentCliControl } from "../src/public-api/cli-control.js";
import { ExtensionRunner } from "../src/public-api/extensions.js";
import {
	AuthStorage as HostAuthStorage,
	ModelRegistry as HostModelRegistry,
	SettingsManager as HostSettingsManager,
} from "../src/public-api/host-services.js";
import { VETTA_CLI_GUIDANCE } from "../src/public-api/product-prompt.js";
import { ALL_SCENARIOS, PERSONAS } from "../src/public-api/profile.js";
import { createCodingAgentSessionResourceRuntime } from "../src/public-api/resources.js";
import {
	GREENFIELD_FULL_RPC_PROFILE,
	GREENFIELD_IM_RPC_PROFILE,
	runRpcModeWithCapabilities,
} from "../src/public-api/rpc.js";
import { createCodingAgentSession } from "../src/public-api/sdk.js";

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
		expect(HostAuthStorage).toBe(root.AuthStorage);
		expect(HostModelRegistry).toBe(root.ModelRegistry);
		expect(HostSettingsManager).toBe(root.SettingsManager);
		expect(ExtensionRunner).toBe(root.ExtensionRunner);
		expect(runCodingAgentCliControl).toBeTypeOf("function");
		expect(createCodingAgentSession).toBeTypeOf("function");
		expect(createCodingAgentSession).not.toBe(root.createAgentSession);
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
			"./concurrency": {
				types: "./dist/core/concurrency-limit.d.ts",
				import: "./dist/core/concurrency-limit.js",
			},
			"./extensions": {
				types: "./dist/public-api/extensions.d.ts",
				import: "./dist/public-api/extensions.js",
			},
			"./host-services": {
				types: "./dist/public-api/host-services.d.ts",
				import: "./dist/public-api/host-services.js",
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
			"./rpc": {
				types: "./dist/public-api/rpc.d.ts",
				import: "./dist/public-api/rpc.js",
			},
			"./sdk": {
				types: "./dist/public-api/sdk.d.ts",
				import: "./dist/public-api/sdk.js",
			},
		});
		expect(Reflect.has(exports as object, "./knowledge")).toBe(false);
		expect(Object.keys(exports).filter((key) => key.startsWith("./compat/"))).toEqual([]);
		expect(Object.keys(exports).filter((key) => key.startsWith("./legacy/"))).toEqual([]);
	});
});
