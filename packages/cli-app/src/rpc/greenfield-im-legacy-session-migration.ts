import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import {
	acquireLegacySessionFormatLease,
	normalizeCodingAgentLegacySessionEntry,
} from "@vetta/coding-agent/runtime-host";
import {
	CONVERSATION_STORAGE_ERROR_CODES,
	ConversationOwnershipConflictError,
	ConversationStorageError,
	LegacySessionImportError,
	type LegacySessionImportIssueCode,
	migrateLegacySessionToV2,
} from "@vetta/runtime-storage/conversation";

export type GreenfieldImLegacySessionMigrationStatus = "migrated" | "reused" | "not-representable";

export interface GreenfieldImLegacySessionMigrationSuccess {
	readonly kind: "greenfield";
	readonly status: "migrated" | "reused";
	readonly sourcePath: string;
	readonly targetPath: string;
	readonly targetSessionId: string;
}

export interface GreenfieldImLegacySessionMigrationFallback {
	readonly kind: "legacy-fallback";
	readonly status: "not-representable";
	readonly sourcePath: string;
	readonly errorCode?: string;
	readonly issueCode?: LegacySessionImportIssueCode;
	readonly issueCount?: number;
}

export type GreenfieldImLegacySessionMigration =
	| GreenfieldImLegacySessionMigrationSuccess
	| GreenfieldImLegacySessionMigrationFallback;

/** Non-destructively import one Legacy JSONL session into a deterministic V2 target. */
export async function migrateGreenfieldImLegacySession(
	sourcePath: string,
	targetRootDir: string,
): Promise<GreenfieldImLegacySessionMigration> {
	const canonicalSourcePath = await realpath(resolve(sourcePath));
	const lease = acquireLegacySessionFormatLease(canonicalSourcePath);
	if (lease.kind === "locked") {
		throw new ConversationOwnershipConflictError(canonicalSourcePath, lease.lockPath, {
			token: "legacy-session-lock",
			pid: lease.holder.pid,
			hostname: lease.holder.hostname,
			acquiredAt: lease.holder.openedAt,
		});
	}

	try {
		const sourceContent = await readFile(canonicalSourcePath);
		const targetSessionId = deterministicTargetSessionId(canonicalSourcePath, sourceContent);
		try {
			const result = await migrateWithConflictRecovery(canonicalSourcePath, targetRootDir, targetSessionId);
			return {
				kind: "greenfield",
				status: result.created ? "migrated" : "reused",
				sourcePath: canonicalSourcePath,
				targetPath: result.targetPath,
				targetSessionId: result.targetSessionId,
			};
		} catch (error) {
			if (!isNotRepresentable(error)) throw error;
			const importIssue = readImportIssue(error);
			return {
				kind: "legacy-fallback",
				status: "not-representable",
				sourcePath: canonicalSourcePath,
				errorCode: readErrorCode(error),
				...(importIssue ?? {}),
			};
		}
	} finally {
		lease.lease.release();
	}
}

async function migrateWithConflictRecovery(sourcePath: string, targetRootDir: string, targetSessionId: string) {
	try {
		return await migrateToTarget(sourcePath, targetRootDir, targetSessionId);
	} catch (error) {
		if (!isTargetConflict(error)) throw error;
		return migrateToTarget(sourcePath, targetRootDir, `${targetSessionId}-recovery`);
	}
}

function migrateToTarget(sourcePath: string, targetRootDir: string, targetSessionId: string) {
	return migrateLegacySessionToV2({
		sourcePath,
		targetRootDir,
		targetSessionId,
		reuseIdenticalTarget: true,
		entryNormalizer: normalizeCodingAgentLegacySessionEntry,
	});
}

function readImportIssue(
	error: unknown,
): { readonly issueCode: LegacySessionImportIssueCode; readonly issueCount: number } | undefined {
	if (!(error instanceof LegacySessionImportError)) return undefined;
	const firstIssue = error.analysis.issues[0];
	return firstIssue ? { issueCode: firstIssue.code, issueCount: error.analysis.issues.length } : undefined;
}

function deterministicTargetSessionId(sourcePath: string, sourceContent: Uint8Array): string {
	const digest = createHash("sha256").update(sourcePath).update("\0").update(sourceContent).digest("base64url");
	return `legacy-import-${digest}`;
}

function isNotRepresentable(error: unknown): boolean {
	return (
		error instanceof ConversationStorageError &&
		(error.code === CONVERSATION_STORAGE_ERROR_CODES.CORRUPT ||
			error.code === CONVERSATION_STORAGE_ERROR_CODES.INVALID_EVENT ||
			error.code === CONVERSATION_STORAGE_ERROR_CODES.INVALID_COMMAND)
	);
}

function isTargetConflict(error: unknown): boolean {
	return error instanceof ConversationStorageError && error.code === CONVERSATION_STORAGE_ERROR_CODES.ALREADY_EXISTS;
}

function readErrorCode(error: unknown): string | undefined {
	if (error instanceof ConversationStorageError) return error.code;
	if (typeof error !== "object" || error === null) return undefined;
	const code = Reflect.get(error, "code");
	return typeof code === "string" ? code : undefined;
}
