import { describe, expect, it } from "vitest";
import {
	createGreenfieldRuntimeComposition as createOwnedGreenfieldRuntimeComposition,
	resolveGreenfieldSessionIdFromPath as resolveOwnedGreenfieldSessionIdFromPath,
} from "../../coding-agent/src/composition/index.js";
import {
	createGreenfieldRuntimeComposition,
	RUNTIME_COMPOSITION_ARTIFACT_MANIFEST,
	resolveGreenfieldSessionIdFromPath,
} from "../src/index.js";

describe("runtime composition package contract", () => {
	it("publishes a host-neutral artifact manifest", () => {
		expect(RUNTIME_COMPOSITION_ARTIFACT_MANIFEST).toEqual({
			packageName: "@vetta/runtime-composition",
			entrypoints: ["index.js"],
			typeEntrypoints: ["index.d.ts"],
			runtimeAssets: [],
		});
	});

	it("keeps the Greenfield conversation path contract after relocation", () => {
		const sessionId = "session/with spaces";
		const encoded = Buffer.from(sessionId, "utf8").toString("base64url");
		expect(resolveGreenfieldSessionIdFromPath("C:/sessions", `C:/sessions/${encoded}.conversation.jsonl`)).toBe(
			sessionId,
		);
		expect(
			resolveGreenfieldSessionIdFromPath("C:/sessions", "C:/outside/session.conversation.jsonl"),
		).toBeUndefined();
	});

	it("forwards composition APIs to the coding-agent owner without wrapping behavior", () => {
		expect(createGreenfieldRuntimeComposition).toBe(createOwnedGreenfieldRuntimeComposition);
		expect(resolveGreenfieldSessionIdFromPath).toBe(resolveOwnedGreenfieldSessionIdFromPath);
	});
});
