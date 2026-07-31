import { describe, expect, it } from "vitest";
import type { RuntimeCanaryKnowledgeContract } from "./contracts.js";
import { compareRuntimeCanaryKnowledgeResults } from "./knowledge-differential.js";

describe("Runtime Canary Knowledge differential", () => {
	it("allows only the selected Runtime identity when normalized contracts match", () => {
		const contract = createContract();
		const result = compareRuntimeCanaryKnowledgeResults(
			envelope("legacy", contract),
			envelope("greenfield", contract),
		);

		expect(result.blockingDifferences).toEqual([]);
		expect(result.allowedDifferences).toEqual([
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
});

function envelope(mode: "legacy" | "greenfield", contract: RuntimeCanaryKnowledgeContract): unknown {
	return {
		ok: true,
		result: {
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
