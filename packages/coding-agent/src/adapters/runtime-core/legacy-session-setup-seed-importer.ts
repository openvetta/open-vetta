import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateLegacySessionToV2 } from "@vetta/runtime-storage/conversation";
import type {
	CodingAgentGreenfieldSessionSeedInitializer,
	CodingAgentGreenfieldSessionSeedTarget,
} from "../../composition/greenfield-active-session-transition-host.js";
import type { ExtensionSessionSetup } from "../../extensions/index.js";
import { LegacySessionSetupWriter } from "./legacy-session-format/setup-writer.js";
import { normalizeCodingAgentLegacySessionEntry } from "./legacy-session-import-normalizer.js";

export type CodingAgentLegacySessionSetup = ExtensionSessionSetup;

export interface CodingAgentGreenfieldSessionSeedImport extends CodingAgentGreenfieldSessionSeedTarget {
	readonly setup: CodingAgentLegacySessionSetup;
}

export interface CodingAgentGreenfieldSessionSeedImporter {
	createSeed(input: CodingAgentGreenfieldSessionSeedImport): Promise<void>;
}

/**
 * Extension `newSession.setup` 的 Legacy 格式兼容适配器。
 *
 * 窄兼容 Writer 只在临时目录中承接既有 Extension setup 合同；生成的快照随后通过
 * 严格迁移器导入 Conversation V2，活动 Session 事务宿主不接触 Legacy 执行对象或旧核心。
 */
export class CodingAgentLegacySessionSetupSeedImporter implements CodingAgentGreenfieldSessionSeedImporter {
	createInitializer(setup: CodingAgentLegacySessionSetup): CodingAgentGreenfieldSessionSeedInitializer {
		return {
			initializeSeed: (target) => this.createSeed({ ...target, setup }),
		};
	}

	async createSeed(input: CodingAgentGreenfieldSessionSeedImport): Promise<void> {
		const temporaryDirectory = await mkdtemp(join(tmpdir(), "vetta-greenfield-session-setup-"));
		const sourcePath = join(temporaryDirectory, "session.jsonl");
		const setupWriter = new LegacySessionSetupWriter({
			cwd: input.cwd,
			sessionDirectory: temporaryDirectory,
			sessionPath: sourcePath,
			parentSession: input.parentSession,
		});
		try {
			await input.setup(setupWriter);
			await migrateLegacySessionToV2({
				sourcePath,
				targetRootDir: input.targetRootDir,
				targetSessionId: input.targetSessionId,
				entryNormalizer: normalizeCodingAgentLegacySessionEntry,
			});
		} finally {
			await rm(temporaryDirectory, { force: true, recursive: true });
		}
	}
}
