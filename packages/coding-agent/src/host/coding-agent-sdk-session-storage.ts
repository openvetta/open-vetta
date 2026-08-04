import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { migrateLegacySessionToV2 } from "@vetta/runtime-storage/conversation";
import { normalizeCodingAgentLegacySessionEntry } from "../adapters/runtime-core/legacy-session-import-normalizer.js";
import type { GreenfieldSdkSessionStorageTarget } from "../composition/greenfield-sdk-session-storage.js";
import {
	type CodingAgentSessionContext,
	type CodingAgentSessionView,
	projectCodingAgentSessionContext,
} from "../sessions/index.js";
import { resolveCodingAgentSessionDir } from "./coding-agent-session-storage.js";

export const CODING_AGENT_SDK_STORAGE_ADAPTER_ERROR_CODES = {
	IN_MEMORY_HISTORY_UNSUPPORTED: "greenfield_sdk_in_memory_history_unsupported",
	MISSING_LEGACY_HEADER: "greenfield_sdk_legacy_header_missing",
	MISSING_LEGACY_PATH: "greenfield_sdk_legacy_path_missing",
} as const;

export type CodingAgentSdkStorageAdapterErrorCode =
	(typeof CODING_AGENT_SDK_STORAGE_ADAPTER_ERROR_CODES)[keyof typeof CODING_AGENT_SDK_STORAGE_ADAPTER_ERROR_CODES];

export class CodingAgentSdkStorageAdapterError extends Error {
	constructor(
		readonly code: CodingAgentSdkStorageAdapterErrorCode,
		message: string,
	) {
		super(message);
		this.name = "CodingAgentSdkStorageAdapterError";
	}
}

export interface CodingAgentSdkSessionHistory {
	readonly context: CodingAgentSessionContext;
	readonly hasThinkingLevelEntry: boolean;
}

export interface CodingAgentSdkSessionStoragePreparation {
	readonly storage: GreenfieldSdkSessionStorageTarget;
	readonly history?: CodingAgentSdkSessionHistory;
}

export interface PrepareCodingAgentSdkSessionStorageOptions {
	readonly cwd: string;
	readonly sessionManager?: CodingAgentLegacySdkSessionSource;
}

/** Structural compatibility port for the deprecated concrete SDK session input. */
export interface CodingAgentLegacySdkSessionSource extends CodingAgentSessionView {
	isPersisted(): boolean;
	close(): void;
}

/**
 * 把旧 SDK 的 SessionManager 输入转换成 Greenfield 原生存储意图。
 *
 * Legacy 文件只读快照后迁移到 Conversation V2；不会原地改写用户的 JSONL。空的
 * in-memory SessionManager 可无损映射，已有内存历史因无法同时保留“不落盘”语义而显式拒绝。
 */
export async function prepareCodingAgentSdkSessionStorage(
	options: PrepareCodingAgentSdkSessionStorageOptions,
): Promise<CodingAgentSdkSessionStoragePreparation> {
	const sessionManager = options.sessionManager;
	if (!sessionManager) {
		return {
			storage: { kind: "file-create", conversationDir: resolveCodingAgentSessionDir(options.cwd) },
		};
	}

	const history = readHistory(sessionManager);
	if (!sessionManager.isPersisted()) {
		sessionManager.close();
		if (sessionManager.getEntries().length > 0) {
			throw new CodingAgentSdkStorageAdapterError(
				CODING_AGENT_SDK_STORAGE_ADAPTER_ERROR_CODES.IN_MEMORY_HISTORY_UNSUPPORTED,
				"Greenfield SDK cannot migrate a populated in-memory Legacy session without changing its persistence semantics",
			);
		}
		return {
			storage: { kind: "memory", sessionId: sessionManager.getSessionId() },
			history,
		};
	}

	const sourcePath = sessionManager.getSessionFile();
	if (!sourcePath) {
		sessionManager.close();
		throw new CodingAgentSdkStorageAdapterError(
			CODING_AGENT_SDK_STORAGE_ADAPTER_ERROR_CODES.MISSING_LEGACY_PATH,
			"Persisted Legacy SDK session does not expose a source path",
		);
	}
	const header = sessionManager.getHeader();
	if (!header) {
		sessionManager.close();
		throw new CodingAgentSdkStorageAdapterError(
			CODING_AGENT_SDK_STORAGE_ADAPTER_ERROR_CODES.MISSING_LEGACY_HEADER,
			"Persisted Legacy SDK session does not contain a session header",
		);
	}

	const entries = [header, ...sessionManager.getEntries()];
	const snapshot = `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
	const targetRootDir = sessionManager.getSessionDir() || resolveCodingAgentSessionDir(options.cwd);
	const targetSessionId = createLegacyTargetSessionId(sourcePath, snapshot);
	const temporaryDirectory = await mkdtemp(join(tmpdir(), "vetta-sdk-legacy-session-"));
	const snapshotPath = join(temporaryDirectory, "session.jsonl");
	sessionManager.close();
	try {
		await writeFile(snapshotPath, snapshot, "utf8");
		const migrated = await migrateLegacySessionToV2({
			sourcePath: snapshotPath,
			targetRootDir,
			targetSessionId,
			reuseIdenticalTarget: true,
			entryNormalizer: normalizeCodingAgentLegacySessionEntry,
		});
		return {
			storage: {
				kind: "file-resume",
				conversationDir: resolve(targetRootDir),
				sessionPath: migrated.targetPath,
			},
			history,
		};
	} finally {
		await rm(temporaryDirectory, { recursive: true, force: true });
	}
}

function readHistory(sessionManager: CodingAgentLegacySdkSessionSource): CodingAgentSdkSessionHistory {
	const entries = sessionManager.getEntries();
	return {
		context: projectCodingAgentSessionContext(entries, sessionManager.getLeafId()),
		hasThinkingLevelEntry: sessionManager.getBranch().some((entry) => entry.type === "thinking_level_change"),
	};
}

function createLegacyTargetSessionId(sourcePath: string, snapshot: string): string {
	const digest = createHash("sha256").update(resolve(sourcePath)).update("\0").update(snapshot).digest("base64url");
	return `legacy-sdk-${digest}`;
}
