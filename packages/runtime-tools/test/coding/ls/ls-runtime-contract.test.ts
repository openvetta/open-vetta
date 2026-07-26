import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ALL_SCENARIOS, resolveActiveToolNames } from "../../../../coding-agent/src/core/session/tool-scope.js";
import { createLsTool as createLegacyLsTool } from "../../../../coding-agent/src/core/tools/ls/index.js";
import { createLsTool, createLsToolRegistration, selectCodingToolsForScope } from "../../../src/coding/index.js";
import type { LsBehaviorSubject, LsBehaviorSubjectOptions } from "./ls-behavior-contract.js";
import { defineLsBehaviorContract } from "./ls-behavior-contract.js";

function createRuntimeSubject(cwd: string, options?: LsBehaviorSubjectOptions): LsBehaviorSubject {
	const registration = createLsToolRegistration(cwd, options);
	return {
		definition: {
			name: registration.tool.name,
			label: registration.tool.label,
			description: registration.tool.description,
			schema: registration.tool.inputSchema,
			scopeUse: registration.scopeUse,
			category: registration.category,
		},
		execute(input, signal = new AbortController().signal) {
			return registration.tool.execute({
				sessionId: "session-1",
				turnId: "turn-1",
				toolCallId: "runtime-ls-contract",
				input,
				signal,
			});
		},
	};
}

defineLsBehaviorContract("runtime", createRuntimeSubject);

describe("ls legacy differential", () => {
	const temporaryDirectories: string[] = [];

	afterEach(() => {
		for (const directory of temporaryDirectories.splice(0)) {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("keeps the complete definition and registration metadata unchanged", () => {
		const legacy = createLegacyLsTool(process.cwd());
		const runtime = createLsToolRegistration(process.cwd());

		expect({
			name: runtime.tool.name,
			label: runtime.tool.label,
			description: runtime.tool.description,
			schema: runtime.tool.inputSchema,
			scopeUse: runtime.scopeUse,
			category: runtime.category,
		}).toEqual({
			name: legacy.name,
			label: legacy.label,
			description: legacy.description,
			schema: legacy.parameters,
			scopeUse: legacy.scope_use,
			category: legacy.category,
		});

		for (const scenario of ALL_SCENARIOS) {
			const legacyNames = resolveActiveToolNames(scenario, [legacy], new Set());
			const runtimeNames = selectCodingToolsForScope([runtime], scenario).map(({ name }) => name);
			expect(runtimeNames).toEqual(legacyNames);
		}
	});

	it("returns byte-for-byte equal sorted, directory, and limit output", async () => {
		const directory = mkdtempSync(join(tmpdir(), "runtime-tools-ls-differential-"));
		temporaryDirectories.push(directory);
		writeFileSync(join(directory, "zeta.txt"), "z");
		writeFileSync(join(directory, "Alpha.txt"), "a");
		mkdirSync(join(directory, "folder"));
		const legacy = createLegacyLsTool(directory);
		const runtime = createLsTool(directory);

		const legacyResult = await legacy.execute("legacy-ls", { path: directory, limit: 2 });
		const runtimeResult = await runtime.execute({
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "runtime-ls",
			input: { path: directory, limit: 2 },
			signal: new AbortController().signal,
		});

		expect(runtimeResult).toEqual(legacyResult);
	});
});
