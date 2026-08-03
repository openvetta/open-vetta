import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
	CodingAgentPromptOptions,
	CodingAgentSession,
	CodingAgentSessionCore,
	CodingAgentSessionEventListener,
	CodingAgentSessionToolDefinition,
} from "../../src/public-api/sdk.js";
import * as publicSdk from "../../src/public-api/sdk.js";

const PUBLIC_SDK_DIRECTORY = new URL("../../src/public-api/sdk/", import.meta.url);
const PUBLIC_SDK_ENTRY = new URL("../../src/public-api/sdk.ts", import.meta.url);

describe("public Coding Agent SDK boundary", () => {
	it("exports only the stable runtime entrypoints", () => {
		expect(Object.keys(publicSdk).sort()).toEqual([
			"CODING_AGENT_SESSION_CREATE_ERROR_CODES",
			"CodingAgentSessionCreateError",
			"createCodingAgentSession",
		]);
	});

	it("keeps migration and concrete manager names out of public SDK sources", () => {
		const publicFiles = [
			PUBLIC_SDK_ENTRY,
			...readdirSync(PUBLIC_SDK_DIRECTORY)
				.filter((name) => name.endsWith(".ts"))
				.map((name) => new URL(name, PUBLIC_SDK_DIRECTORY)),
		];
		expect(readdirSync(PUBLIC_SDK_DIRECTORY).sort()).toEqual([
			"index.ts",
			"sdk-create-contract.ts",
			"sdk-session-contract.ts",
		]);
		for (const file of publicFiles) {
			const source = readFileSync(file, "utf8");
			expect(source, file.pathname).not.toMatch(
				/\b(?:(?:Greenfield|Legacy)[A-Za-z0-9_]*|ModelRegistry|ResourceLoader|SessionManager|SettingsManager)\b/,
			);
		}
	});
});

function verifyStablePublicTypes(
	session: CodingAgentSession,
	tool: CodingAgentSessionToolDefinition,
	options: CodingAgentPromptOptions,
	listener: CodingAgentSessionEventListener,
): CodingAgentSessionCore {
	void [tool, options, listener];
	return session;
}

void verifyStablePublicTypes;
