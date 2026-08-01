import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { acquireLegacySessionFormatLease } from "@vetta/coding-agent/runtime-host";
import {
	CONVERSATION_STORAGE_ERROR_CODES,
	ConversationStorageError,
	LegacySessionImportError,
	type LegacySessionImportIssueCode,
	migrateLegacySessionToV2,
} from "@vetta/runtime-storage/conversation";

export type GreenfieldImLegacySessionMigrationStatus =
	| "migrated"
	| "reused"
	| "locked"
	| "not-representable"
	| "failed";

export interface GreenfieldImLegacySessionMigrationSuccess {
	readonly kind: "greenfield";
	readonly status: "migrated" | "reused";
	readonly sourcePath: string;
	readonly targetPath: string;
	readonly targetSessionId: string;
}

export interface GreenfieldImLegacySessionMigrationFallback {
	readonly kind: "legacy-fallback";
	readonly status: "locked" | "not-representable" | "failed";
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
		return { kind: "legacy-fallback", status: "locked", sourcePath: canonicalSourcePath };
	}

	try {
		const sourceContent = await readFile(canonicalSourcePath);
		const targetSessionId = deterministicTargetSessionId(canonicalSourcePath, sourceContent);
		try {
			const result = await migrateLegacySessionToV2({
				sourcePath: canonicalSourcePath,
				targetRootDir,
				targetSessionId,
				reuseIdenticalTarget: true,
			});
			return {
				kind: "greenfield",
				status: result.created ? "migrated" : "reused",
				sourcePath: canonicalSourcePath,
				targetPath: result.targetPath,
				targetSessionId: result.targetSessionId,
			};
		} catch (error) {
			const importIssue = readImportIssue(error);
			return {
				kind: "legacy-fallback",
				status: isNotRepresentable(error) ? "not-representable" : "failed",
				sourcePath: canonicalSourcePath,
				errorCode: readErrorCode(error),
				...(importIssue ?? {}),
			};
		}
	} finally {
		lease.lease.release();
	}
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

function readErrorCode(error: unknown): string | undefined {
	if (error instanceof ConversationStorageError) return error.code;
	if (typeof error !== "object" || error === null) return undefined;
	const code = Reflect.get(error, "code");
	return typeof code === "string" ? code : undefined;
}
