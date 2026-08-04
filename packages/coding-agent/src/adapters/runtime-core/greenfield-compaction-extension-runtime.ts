import type { CompactionPreparation, CompactionResult } from "../../compaction/index.js";
import type { CompactionEntry, SessionEntry } from "../../core/session-manager/index.js";
import type { SessionBeforeCompactResult } from "../../extensions/index.js";
import type { CodingAgentGreenfieldExtensionRunnerPort } from "./greenfield-extension-contract.js";

export interface CodingAgentCompactionExtensionInput {
	readonly preparation: CompactionPreparation;
	readonly branchEntries: readonly SessionEntry[];
	readonly customInstructions?: string;
	readonly signal: AbortSignal;
}

export interface CodingAgentCompactionExtensionResult {
	readonly cancel?: boolean;
	readonly compaction?: CompactionResult;
}

export interface CodingAgentCompactionCommittedInput {
	readonly compactionEntry: CompactionEntry;
	readonly fromExtension: boolean;
}

/** Coding Context Runtime 使用的窄 Extension 边界。 */
export interface CodingAgentCompactionExtensionRuntime {
	beforeCompaction(
		input: CodingAgentCompactionExtensionInput,
	): Promise<CodingAgentCompactionExtensionResult | undefined>;
	afterCompaction(input: CodingAgentCompactionCommittedInput): Promise<void>;
}

type CompactionExtensionRunner = Pick<CodingAgentGreenfieldExtensionRunnerPort, "emit" | "hasHandlers">;

export function createCodingAgentCompactionExtensionRuntime(
	readRunner: () => CompactionExtensionRunner | undefined,
): CodingAgentCompactionExtensionRuntime {
	return {
		async beforeCompaction(input) {
			const runner = readRunner();
			if (!runner) return undefined;
			if (!runner.hasHandlers("session_before_compact")) return undefined;
			return (await runner.emit({
				type: "session_before_compact",
				preparation: input.preparation,
				branchEntries: [...input.branchEntries],
				customInstructions: input.customInstructions,
				signal: input.signal,
			})) as SessionBeforeCompactResult | undefined;
		},
		async afterCompaction(input) {
			const runner = readRunner();
			if (!runner) return;
			if (!runner.hasHandlers("session_compact")) return;
			await runner.emit({
				type: "session_compact",
				compactionEntry: input.compactionEntry,
				fromExtension: input.fromExtension,
			});
		},
	};
}
