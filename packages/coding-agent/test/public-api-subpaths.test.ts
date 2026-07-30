import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as config from "../src/config.js";
import * as knowledge from "../src/core/knowledge/index.js";
import { DefaultResourceLoader } from "../src/core/resource-loader.js";
import * as root from "../src/index.js";
import { createAgentCliBootstrap, createCodingAgentHostBootstrap } from "../src/public-api/bootstrap.js";
import { ALL_SCENARIOS, PERSONAS } from "../src/public-api/profile.js";
import {
	createImSendAttachmentTool,
	GREENFIELD_IM_RPC_PROFILE,
	runRpcModeWithCapabilities,
} from "../src/public-api/rpc.js";

describe("coding-agent public subpaths", () => {
	it("forwards existing root APIs without wrapping or replacing behavior", () => {
		expect(createAgentCliBootstrap).toBe(root.createAgentCliBootstrap);
		expect(createCodingAgentHostBootstrap).toBe(root.createCodingAgentHostBootstrap);
		expect(runRpcModeWithCapabilities).toBe(root.runRpcModeWithCapabilities);
		expect(createImSendAttachmentTool).toBe(root.createImSendAttachmentTool);
		expect(GREENFIELD_IM_RPC_PROFILE).toBe(root.GREENFIELD_IM_RPC_PROFILE);
		expect(ALL_SCENARIOS).toBe(root.ALL_SCENARIOS);
		expect(PERSONAS).toBe(root.PERSONAS);
		expect(config.getAgentDir).toBe(root.getAgentDir);
		expect(knowledge.knowledgeRoot).toBe(root.knowledge.knowledgeRoot);
		expect(DefaultResourceLoader).toBe(root.DefaultResourceLoader);
	});

	it("publishes the explicit package export targets", () => {
		const manifest: unknown = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
		const exports = Reflect.get(manifest as object, "exports");
		expect(exports).toMatchObject({
			"./bootstrap": {
				types: "./dist/public-api/bootstrap.d.ts",
				import: "./dist/public-api/bootstrap.js",
			},
			"./config": {
				types: "./dist/config.d.ts",
				import: "./dist/config.js",
			},
			"./knowledge": {
				types: "./dist/core/knowledge/index.d.ts",
				import: "./dist/core/knowledge/index.js",
			},
			"./profile": {
				types: "./dist/public-api/profile.d.ts",
				import: "./dist/public-api/profile.js",
			},
			"./resources": {
				types: "./dist/core/resource-loader.d.ts",
				import: "./dist/core/resource-loader.js",
			},
			"./rpc": {
				types: "./dist/public-api/rpc.d.ts",
				import: "./dist/public-api/rpc.js",
			},
		});
	});
});
