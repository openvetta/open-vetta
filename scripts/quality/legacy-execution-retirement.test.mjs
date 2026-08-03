import { describe, expect, it } from "vitest";
import {
	collectGreenfieldSharedCoreImports,
	findLegacyExecutionRetirementViolations,
	LEGACY_EXECUTION_EDGE_BASELINE,
} from "./check-legacy-execution-retirement.mjs";

describe("Legacy execution retirement gate", () => {
	it("rejects a new production Legacy execution consumer", () => {
		const violations = findLegacyExecutionRetirementViolations([
			{
				path: "packages/desktop-app/src/main/new-runtime.ts",
				text: 'import { LegacyCodingAgentSessionBackend } from "@vetta/coding-agent/runtime-host";',
			},
		]);

		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain("outside the retirement baseline");
	});

	it("keeps host production activation outside the remaining implementation baseline", () => {
		expect(
			LEGACY_EXECUTION_EDGE_BASELINE.some(
				(edge) => edge.path.startsWith("packages/cli-app/") || edge.path.startsWith("packages/desktop-app/"),
			),
		).toBe(false);
	});

	it("keeps retained Legacy format readers independent from execution", () => {
		const violations = findLegacyExecutionRetirementViolations([
			{
				path: "packages/coding-agent/src/adapters/runtime-core/legacy-session-format/example.ts",
				text: 'import { createAgentSession } from "../../../core/sdk.js";',
			},
		]);

		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain("format boundary must not depend on Legacy execution");
	});

	it("reports Greenfield imports of shared core capabilities separately", () => {
		const imports = collectGreenfieldSharedCoreImports([
			{
				path: "packages/coding-agent/src/adapters/runtime-core/greenfield-example.ts",
				text: 'import { createReadTool } from "../../core/tools/read/index.js";',
			},
			{
				path: "packages/coding-agent/src/adapters/runtime-core/legacy-example.ts",
				text: 'import { AgentSession } from "../../core/agent-session.js";',
			},
		]);

		expect(imports).toEqual([
			"packages/coding-agent/src/adapters/runtime-core/greenfield-example.ts -> ../../core/tools/read/index.js",
		]);
	});
});
