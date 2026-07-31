import { describe, expect, it } from "vitest";
import type { RuntimeCanaryKnowledgeContract, RuntimeCanaryMode, RuntimeCanarySelection } from "./contracts.js";
import { compareRuntimeCanaryDefaultCutover, compareRuntimeCanaryKnowledgeResults } from "./knowledge-differential.js";

describe("Runtime Canary Knowledge differential", () => {
	it("allows only the selected Runtime identity when normalized contracts match", () => {
		const contract = createContract();
		const result = compareRuntimeCanaryKnowledgeResults(
			envelope("legacy", contract),
			envelope("greenfield", contract),
		);

		expect(result.blockingDifferences).toEqual([]);
		expect(result.allowedDifferences).toEqual([
			expect.objectContaining({ path: "runtimeSelection", legacy: "legacy", greenfield: "greenfield" }),
			expect.objectContaining({ path: "runtimeMode", legacy: "legacy", greenfield: "greenfield" }),
			expect.objectContaining({
				path: "processingRecordFormat",
				legacy: "legacy-jsonl",
				greenfield: "conversation-v2-jsonl",
			}),
		]);
	});

	it("reports the exact contract path for a behavior difference", () => {
		const legacy = createContract();
		const greenfield = {
			...legacy,
			monitor: { ...legacy.monitor, filesFailed: 1 },
		};

		expect(
			compareRuntimeCanaryKnowledgeResults(envelope("legacy", legacy), envelope("greenfield", greenfield))
				.blockingDifferences,
		).toEqual([{ path: "knowledgeContract.monitor.filesFailed", legacy: 0, greenfield: 1 }]);
	});

	it("rejects reversed Runtime inputs instead of silently comparing the wrong sides", () => {
		const contract = createContract();
		expect(() =>
			compareRuntimeCanaryKnowledgeResults(envelope("greenfield", contract), envelope("legacy", contract)),
		).toThrow("requires Legacy first and Greenfield second");
	});

	it("proves the unconfigured selection is behaviorally identical to explicit Greenfield", () => {
		const contract = createContract();
		const result = compareRuntimeCanaryDefaultCutover(
			envelope("default", contract),
			envelope("greenfield", contract),
		);

		expect(result.blockingDifferences).toEqual([]);
		expect(result.defaultKnowledge).toEqual(contract);
		expect(result.explicitGreenfieldKnowledge).toEqual(contract);
	});

	it("reports the exact default cutover path when the effective Runtime differs", () => {
		const contract = createContract();

		expect(
			compareRuntimeCanaryDefaultCutover(envelope("default", contract, "legacy"), envelope("greenfield", contract))
				.blockingDifferences,
		).toContainEqual({
			path: "result.runtimeMode",
			defaultSelection: "legacy",
			explicitGreenfield: "greenfield",
		});
	});

	it("rejects an explicitly selected Runtime in the default-cutover position", () => {
		const contract = createContract();
		expect(() =>
			compareRuntimeCanaryDefaultCutover(envelope("greenfield", contract), envelope("greenfield", contract)),
		).toThrow("requires Default first and explicit Greenfield second");
	});
});

function envelope(
	selection: RuntimeCanarySelection,
	contract: RuntimeCanaryKnowledgeContract,
	mode: RuntimeCanaryMode = selection === "legacy" ? "legacy" : "greenfield",
): unknown {
	return {
		ok: true,
		result: {
			runtimeSelection: selection,
			runtimeMode: mode,
			processingRecordFormat: mode === "legacy" ? "legacy-jsonl" : "conversation-v2-jsonl",
			knowledgeContract: contract,
		},
	};
}

function createContract(): RuntimeCanaryKnowledgeContract {
	const scan = { operation: "scan-now" as const, skipped: false as const };
	return {
		scans: { success: scan, aborted: scan, providerFailure: scan },
		artifacts: {
			path: "runtime-canary/page.md",
			source: "runtime-canary",
			sourcePath: "runtime-canary/source.md",
			sourceHash: "hash",
			tags: ["runtime-canary"],
			title: "Runtime Canary Knowledge",
			summary: "Knowledge processing through the real Desktop process.",
			body: "# Runtime Canary Knowledge",
			orphaned: false,
			manifestPageCount: 1,
			indexedSourcePaths: ["runtime-canary/source.md"],
		},
		failure: {
			sourcePath: "runtime-canary/failure.md",
			attempts: 1,
			quarantined: false,
		},
		monitor: {
			processingInputTokens: 30,
			processingOutputTokens: 15,
			processingRounds: 3,
			filesProcessed: 1,
			filesFailed: 0,
			manualScanCount: 3,
		},
		notifications: [{ type: "processing", value: true }, { type: "statuses" }, { type: "processing", value: false }],
		processingRecordCount: 3,
		lifecycle: {
			desktopRestarted: true,
			sessionLocksReleased: true,
			rawsUnlocked: true,
			endpointRemoved: true,
			providerStopped: true,
			desktopExitCode: 0,
		},
	};
}
