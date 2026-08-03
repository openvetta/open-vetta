import { describe, expect, it } from "vitest";
import {
	findCodingAgentImplementationLogViolations,
	REWRITE_CHARTER_END,
	REWRITE_CHARTER_START,
} from "./check-coding-agent-implementation-log.mjs";
import {
	collectCodingAgentRewriteState,
	findCodingAgentRewriteProgressViolations,
	summarizeCodingAgentRewriteState,
} from "./check-coding-agent-rewrite-progress.mjs";

describe("Coding Agent rewrite progress gate", () => {
	it("collects old implementation imports across ordinary hosts and Runtime packages", () => {
		const state = stateFrom([
			{
				path: "packages/coding-agent/src/host/session-host.ts",
				text: 'import { SettingsManager } from "../core/settings-manager.js";',
			},
			{
				path: "packages/runtime-storage/src/index.ts",
				text: 'export { SessionManager } from "@vetta/coding-agent/compat/runtime-storage";',
			},
		]);

		expect(state.oldImplementationEdges).toHaveLength(2);
		expect(state.runtimeBackedges).toHaveLength(1);
		expect(summarizeCodingAgentRewriteState(state).domains).toEqual({
			compatibility: 1,
			"settings-manager": 1,
		});
	});

	it("rejects a new Runtime package backedge even when it uses a stable public subpath", () => {
		const actual = stateFrom([
			{
				path: "packages/runtime-storage/src/index.ts",
				text: 'export { SettingsManager } from "@vetta/coding-agent/host-services";',
			},
		]);

		expect(findCodingAgentRewriteProgressViolations(actual, emptyState())).toEqual([
			"packages/runtime-storage/src/index.ts: new Runtime package backedge (@vetta/coding-agent/host-services)",
		]);
	});

	it("rejects new edges, accepts an exact baseline and reports stale entries after removal", () => {
		const baseline = stateFrom([
			{
				path: "packages/coding-agent/src/host/session-host.ts",
				text: 'import { SettingsManager } from "../core/settings-manager.js";',
			},
		]);
		const newEdge = stateFrom([
			...sourceFiles(baseline),
			{
				path: "packages/coding-agent/src/host/tool-host.ts",
				text: 'import { createReadTool } from "../core/tools/read/index.js";',
			},
		]);

		expect(findCodingAgentRewriteProgressViolations(baseline, baseline)).toEqual([]);
		expect(findCodingAgentRewriteProgressViolations(newEdge, baseline)).toEqual([
			"packages/coding-agent/src/host/tool-host.ts: new old implementation dependency (../core/tools/read/index.js)",
		]);
		expect(findCodingAgentRewriteProgressViolations(emptyState(), baseline)).toContain(
			"packages/coding-agent/src/host/session-host.ts: stale old implementation dependency baseline (../core/settings-manager.js)",
		);
	});

	it("tracks old files, compatibility exports and legacy SDK examples independently", () => {
		const state = collectCodingAgentRewriteState({
			productionFiles: [
				{ path: "packages/coding-agent/src/core/agent-session.ts", text: "export class AgentSession {}" },
			],
			sdkExampleFiles: [
				{
					path: "packages/coding-agent/examples/sdk/12-full-control.ts",
					text: 'import { createAgentSession } from "@vetta/coding-agent";',
				},
			],
			codingAgentPackageJson: { exports: { "./compat/runtime-tools": "./dist/compat.js" } },
		});

		expect(state.oldImplementationFiles).toEqual(["packages/coding-agent/src/core/agent-session.ts"]);
		expect(state.compatibilityExports).toEqual(["./compat/runtime-tools"]);
		expect(state.legacyExampleImports).toHaveLength(1);
	});
});

describe("Coding Agent implementation record gate", () => {
	const fixedBlock = `${REWRITE_CHARTER_START}\n## 重写目标确认（固定）\n目标。\n${REWRITE_CHARTER_END}`;
	const validBody = `${fixedBlock}\n\n## 本阶段与最终目标的关系\n关系。\n\n## 旧实现依赖变化\n无。\n\n## 行为兼容性验证\n通过。\n\n## 尚未完成的替换\n仍有。`;

	it("accepts the exact fixed block and all required headings", () => {
		expect(
			findCodingAgentImplementationLogViolations({
				charterText: fixedBlock,
				logs: [{ path: "docs/225-valid.md", text: validBody }],
			}),
		).toEqual([]);
	});

	it("rejects a changed charter and missing stage evidence", () => {
		const violations = findCodingAgentImplementationLogViolations({
			charterText: fixedBlock,
			logs: [{ path: "docs/225-invalid.md", text: `${REWRITE_CHARTER_START}\n改变。\n${REWRITE_CHARTER_END}` }],
		});

		expect(violations).toHaveLength(5);
		expect(violations[0]).toContain("fixed rewrite charter block differs");
	});
});

function stateFrom(productionFiles) {
	return collectCodingAgentRewriteState({
		productionFiles,
		sdkExampleFiles: [],
		codingAgentPackageJson: { exports: {} },
	});
}

function emptyState() {
	return stateFrom([]);
}

function sourceFiles(state) {
	return state.oldImplementationEdges.map((edge) => ({
		path: edge.path,
		text: `import { ${edge.names.join(", ")} } from "${edge.specifier}";`,
	}));
}
