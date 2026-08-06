import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "@mariozechner/jiti";
import * as bundledTypebox from "@sinclair/typebox";
import * as bundledAgentCore from "@vetta/agent-core";
import * as bundledAi from "@vetta/ai";
import { isBunBinary } from "../../../config.js";
import * as bundledCodingAgent from "../../../index.js";
import type { ExtensionFactory } from "../../api-contracts.js";

const VIRTUAL_MODULES: Record<string, unknown> = {
	"@sinclair/typebox": bundledTypebox,
	"@vetta/agent-core": bundledAgentCore,
	"@vetta/ai": bundledAi,
	"@vetta/coding-agent": bundledCodingAgent,
	"@vetta/coding-agent/extensions": bundledCodingAgent,
};

const require = createRequire(import.meta.url);
let aliases: Record<string, string> | undefined;

function resolveAliases(): Record<string, string> {
	if (aliases) return aliases;
	const directory = path.dirname(fileURLToPath(import.meta.url));
	const packageIndex = path.resolve(directory, "../../..", "index.js");
	const typeboxEntry = require.resolve("@sinclair/typebox");
	const typeboxRoot = typeboxEntry.replace(/[\\/]build[\\/]cjs[\\/]index\.js$/, "");
	aliases = {
		"@vetta/coding-agent": packageIndex,
		"@vetta/agent-core": require.resolve("@vetta/agent-core"),
		"@vetta/ai": require.resolve("@vetta/ai"),
		"@sinclair/typebox": typeboxRoot,
	};
	return aliases;
}

function optionalAliases(): Record<string, string> | undefined {
	if (isBunBinary) return undefined;
	try {
		return resolveAliases();
	} catch {
		return undefined;
	}
}

export async function loadExtensionFactory(extensionPath: string): Promise<ExtensionFactory | undefined> {
	const alias = optionalAliases();
	const jiti = createJiti(import.meta.url, {
		moduleCache: false,
		virtualModules: VIRTUAL_MODULES,
		tryNative: false,
		...(alias ? { alias } : {}),
	});
	const module = await jiti.import(extensionPath, { default: true });
	return typeof module === "function" ? (module as ExtensionFactory) : undefined;
}
