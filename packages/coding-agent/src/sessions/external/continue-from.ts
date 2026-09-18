import type { SessionHistoryImportSource } from "@vetta/runtime-core";
import type { ConversationDocumentEntry } from "@vetta/runtime-core/conversation";
import {
	buildExternalBriefingCacheKey,
	buildExternalBriefingPrompt,
	readGrokSidecarSupplement,
	resolveTrustedContinueCwd,
	truncateBriefingRounds,
} from "./continue-from-briefing.js";
import { buildExternalSessionContinueSeed } from "./continue-from-seed.js";
import { EXTERNAL_SESSION_HISTORY_UNAVAILABLE, projectGrokConversationBriefingRounds } from "./grok-conversation.js";
import {
	findGrokSummaryHeader,
	GROK_CONVERSATION_BODY_NAME,
	GROK_HEADER_SCAN_LINES,
	GROK_TOOL_ID,
} from "./grok-summary.js";
import type { ExternalSessionFileHost } from "./host-contracts.js";

export interface ExternalSessionContinueRequest {
	readonly sessionPath: string;
	readonly modelKey: string;
	readonly cwdOverride?: string;
	readonly forceCreate?: boolean;
}

export interface ExistingImportedExternalSession {
	readonly sessionId: string;
	readonly sessionPath: string;
	readonly cwd: string;
	readonly importedAt: number;
	readonly name?: string;
}

export interface ExternalSessionOriginSnapshot {
	readonly sessionId: string;
	readonly root: string;
	readonly sidecarPath: string;
	readonly bodyPath?: string;
}

export type ExternalSessionContinueResult =
	| {
			readonly kind: "created";
			readonly sessionId: string;
			readonly sessionPath: string;
			readonly cwd: string;
			readonly importedFrom: SessionHistoryImportSource;
			readonly usedCache: boolean;
	  }
	| {
			readonly kind: "already_imported";
			readonly existing: ExistingImportedExternalSession;
	  }
	| {
			readonly kind: "cwd_missing";
			readonly suggestedCwd: string;
	  };

export interface ExternalSessionBriefingCache {
	get(key: string): Promise<string | undefined>;
	set(key: string, briefing: string): Promise<void>;
}

export interface ExternalSessionContinuePersistInput {
	readonly sessionId: string;
	readonly cwd: string;
	readonly name?: string;
	readonly entries: readonly ConversationDocumentEntry[];
	readonly activeLeafId: string;
	readonly importedFrom: SessionHistoryImportSource;
	readonly modelKey: string;
}

export interface ExternalSessionContinuePorts {
	readonly files: ExternalSessionFileHost;
	readonly cache: ExternalSessionBriefingCache;
	findImportedSessions(source: {
		readonly tool: string;
		readonly path: string;
	}): Promise<readonly ExistingImportedExternalSession[]>;
	copyOriginSnapshot(input: {
		readonly sessionId: string;
		readonly sourceSidecarPath: string;
		readonly sourceBodyPath?: string;
	}): Promise<ExternalSessionOriginSnapshot>;
	deleteOriginSnapshot(sessionId: string): Promise<void>;
	generateBriefing(input: {
		readonly modelKey: string;
		readonly prompt: string;
		readonly supplement: string;
	}): Promise<string>;
	persistSeededSession(input: ExternalSessionContinuePersistInput): Promise<{
		readonly sessionId: string;
		readonly sessionPath: string;
	}>;
	readonly now?: () => number;
	readonly createEntryId?: () => string;
	readonly createSessionId?: () => string;
}

export function createCodingAgentExternalSessionContinueFrom(
	ports: ExternalSessionContinuePorts,
): (request: ExternalSessionContinueRequest) => Promise<ExternalSessionContinueResult> {
	let entrySequence = 0;
	const now = ports.now ?? Date.now;
	const createEntryId =
		ports.createEntryId ??
		(() => {
			entrySequence += 1;
			return `continue-${entrySequence}`;
		});

	let sessionSequence = 0;
	const createSessionId =
		ports.createSessionId ??
		(() => {
			sessionSequence += 1;
			return `continue-session-${sessionSequence}`;
		});

	return async (request) => {
		if (!request.forceCreate) {
			const existing = pickLatestImportedSession(
				await ports.findImportedSessions({ tool: GROK_TOOL_ID, path: request.sessionPath }),
			);
			if (existing) return { kind: "already_imported", existing };
		}

		const sourceBodyPath = ports.files.join(ports.files.join(request.sessionPath, ".."), GROK_CONVERSATION_BODY_NAME);
		const sidecarStat = await ports.files.statFile(request.sessionPath);
		const bodyStat = ports.files.exists(sourceBodyPath) ? await ports.files.statFile(sourceBodyPath) : undefined;
		const sessionId = createSessionId();
		let copied = false;
		try {
			const snapshot = await ports.copyOriginSnapshot({
				sessionId,
				sourceSidecarPath: request.sessionPath,
				sourceBodyPath,
			});
			copied = true;

			const sidecarText = ports.files.readPrefixLines(snapshot.sidecarPath, GROK_HEADER_SCAN_LINES);
			const header = findGrokSummaryHeader(sidecarText);
			if (header.kind === "corrupted_header" || header.kind === "unrelated") {
				throw new Error(EXTERNAL_SESSION_HISTORY_UNAVAILABLE.corrupted_header);
			}
			if (header.kind === "unsupported_version") {
				throw new Error(EXTERNAL_SESSION_HISTORY_UNAVAILABLE.unsupported_version);
			}

			const cwdResult = resolveTrustedContinueCwd({
				trustedCwd: header.summary.cwd,
				cwdOverride: request.cwdOverride,
				exists: (path) => ports.files.exists(path),
			});
			if (cwdResult.kind === "missing") {
				await ports.deleteOriginSnapshot(sessionId);
				copied = false;
				return { kind: "cwd_missing", suggestedCwd: cwdResult.suggestedCwd };
			}

			const cacheKey = buildExternalBriefingCacheKey({
				path: request.sessionPath,
				sidecar: sidecarStat,
				...(bodyStat ? { body: bodyStat } : {}),
			});

			const fullSidecar = ports.files.readText(snapshot.sidecarPath);
			const supplement = readGrokSidecarSupplement(fullSidecar);
			const body = snapshot.bodyPath ? ports.files.readText(snapshot.bodyPath) : "";
			const truncated = truncateBriefingRounds(projectGrokConversationBriefingRounds(body));
			const prompt = buildExternalBriefingPrompt({
				rounds: truncated.rounds,
				omittedRoundCount: truncated.omittedRoundCount,
				supplement,
			});

			let usedCache = true;
			let briefing = await ports.cache.get(cacheKey);
			if (!briefing) {
				usedCache = false;
				briefing = await ports.generateBriefing({
					modelKey: request.modelKey,
					prompt,
					supplement,
				});
				await ports.cache.set(cacheKey, briefing);
			}

			const importedAt = now();
			const importedFrom: SessionHistoryImportSource = {
				tool: GROK_TOOL_ID,
				path: request.sessionPath,
				importedAt,
			};
			const name = header.summary.title || undefined;
			const seed = buildExternalSessionContinueSeed({
				briefing,
				importedFrom,
				name,
				now: importedAt,
				createEntryId,
			});
			const created = await ports.persistSeededSession({
				sessionId,
				cwd: cwdResult.cwd,
				name: seed.name,
				entries: seed.entries,
				activeLeafId: seed.activeLeafId,
				importedFrom,
				modelKey: request.modelKey,
			});
			copied = false;
			return {
				kind: "created",
				sessionId: created.sessionId,
				sessionPath: created.sessionPath,
				cwd: cwdResult.cwd,
				importedFrom,
				usedCache,
			};
		} catch (error) {
			if (copied) await ports.deleteOriginSnapshot(sessionId);
			throw error;
		}
	};
}

export function pickLatestImportedSession(
	sessions: readonly ExistingImportedExternalSession[],
): ExistingImportedExternalSession | undefined {
	return sessions.reduce<ExistingImportedExternalSession | undefined>((latest, session) => {
		if (!latest || session.importedAt > latest.importedAt) return session;
		return latest;
	}, undefined);
}
