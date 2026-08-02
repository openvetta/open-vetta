import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateLegacySessionToV2 } from "@vetta/runtime-storage/conversation";
import type {
	CodingAgentGreenfieldSessionSeedInitializer,
	CodingAgentGreenfieldSessionSeedTarget,
} from "../../composition/greenfield-active-session-transition-host.js";
import { SessionManager } from "../../core/session-manager/index.js";
import { normalizeCodingAgentLegacySessionEntry } from "./legacy-session-import-normalizer.js";

export type CodingAgentLegacySessionSetup = (sessionManager: SessionManager) => Promise<void>;

export interface CodingAgentGreenfieldSessionSeedImport extends CodingAgentGreenfieldSessionSeedTarget {
	readonly setup: CodingAgentLegacySessionSetup;
}

export interface CodingAgentGreenfieldSessionSeedImporter {
	createSeed(input: CodingAgentGreenfieldSessionSeedImport): Promise<void>;
}

/**
 * Extension `newSession.setup` 的 Legacy 格式兼容适配器。
 *
 * SessionManager 只在临时目录中承接既有 Extension setup 合同；生成的快照随后通过
 * 严格迁移器导入 Conversation V2，活动 Session 事务宿主不接触 Legacy 执行对象。
 */
export class CodingAgentLegacySessionSetupSeedImporter implements CodingAgentGreenfieldSessionSeedImporter {
	createInitializer(setup: CodingAgentLegacySessionSetup): CodingAgentGreenfieldSessionSeedInitializer {
		return {
			initializeSeed: (target) => this.createSeed({ ...target, setup }),
		};
	}

	async createSeed(input: CodingAgentGreenfieldSessionSeedImport): Promise<void> {
		const temporaryDirectory = await mkdtemp(join(tmpdir(), "vetta-greenfield-session-setup-"));
		const sessionManager = SessionManager.create(input.cwd, temporaryDirectory, {
			parentSession: input.parentSession,
		});
		try {
			await input.setup(sessionManager);
			const sourcePath = sessionManager.getSessionFile();
			if (!sourcePath) throw new Error("Extension newSession setup did not create a persisted session");
			const header = sessionManager.getHeader();
			if (!header) throw new Error("Extension newSession setup did not retain a session header");
			const snapshot = [header, ...sessionManager.getEntries()].map((entry) => JSON.stringify(entry)).join("\n");
			await writeFile(sourcePath, `${snapshot}\n`, "utf8");
			sessionManager.close();
			await migrateLegacySessionToV2({
				sourcePath,
				targetRootDir: input.targetRootDir,
				targetSessionId: input.targetSessionId,
				entryNormalizer: normalizeCodingAgentLegacySessionEntry,
			});
		} finally {
			sessionManager.close();
			await rm(temporaryDirectory, { force: true, recursive: true });
		}
	}
}
