import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { completeSimple } from "@vetta/ai";
import { resolveCodingAgentSessionDir } from "@vetta/coding-agent/bootstrap";
import { getAgentDir } from "@vetta/coding-agent/config";
import {
	createCodingAgentExternalSessionContinueFrom,
	type ExistingImportedExternalSession,
	type ExternalSessionBriefingCache,
	type ExternalSessionContinuePersistInput,
	type ExternalSessionContinueRequest,
	type ExternalSessionContinueResult,
	type ExternalSessionFileHost,
	type ExternalSessionOriginSnapshot,
	GROK_TOOL_ID,
	pickLatestImportedSession,
} from "@vetta/coding-agent/external-sessions";
import { publishConversationSeed } from "@vetta/runtime-node/conversation";
import { createNodeResultArtifactStorage, resolveNodeSessionArtifactDirectory } from "@vetta/runtime-node/host";
import { getOrCreateSharedModelRuntime } from "../agent-runtime/host-services.js";
import { getApplicationCacheService } from "../cache/application-cache-service.js";
import { readDesktopConfig, writeDesktopConfig } from "../config/desktop-config-store.js";
import { emitConversationListChanged } from "../conversations/conversation-list-events.js";
import { allowProjectRoot, createFilesystemDirectory } from "../filesystem/filesystem-service.js";
import { getDesktopModelSettingsService } from "../models/model-settings-host.js";
import { broadcastProjectsChanged } from "../projects/project-events.js";
import { ProjectService } from "../projects/project-service.js";

export type { ExistingImportedExternalSession, ExternalSessionContinueRequest, ExternalSessionContinueResult };
export { GROK_TOOL_ID, pickLatestImportedSession };

export const EXTERNAL_ORIGIN_SNAPSHOT_DIR = "external-origin";

const BRIEFING_CACHE_NAMESPACE = "external-briefing";

export const DESKTOP_CONTINUE_FROM_ERROR = {
	NO_DEFAULT_MODEL: "EXTERNAL_SESSION_CONTINUE_NO_DEFAULT_MODEL",
	EMPTY_BRIEFING: "EXTERNAL_SESSION_CONTINUE_EMPTY_BRIEFING",
} as const;

export type DesktopExternalSessionContinueRequest = Omit<ExternalSessionContinueRequest, "modelKey"> & {
	readonly modelKey?: string;
};

export interface ContinueFromModelCandidate {
	readonly key: string;
	readonly hasCredentials: boolean;
}

export interface ContinueFromModelResolverPorts {
	readonly listDefaultModel: () => Promise<string | null | undefined>;
	readonly listCandidates: () => Promise<readonly ContinueFromModelCandidate[]>;
}

export interface DesktopExternalSessionContinueFromPorts {
	readonly files: ExternalSessionFileHost;
	readonly cache: ExternalSessionBriefingCache;
	readonly findImportedSessions: (source: {
		readonly tool: string;
		readonly path: string;
	}) => Promise<readonly ExistingImportedExternalSession[]>;
	readonly copyOriginSnapshot: (input: {
		readonly sessionId: string;
		readonly sourceSidecarPath: string;
		readonly sourceBodyPath?: string;
	}) => Promise<ExternalSessionOriginSnapshot>;
	readonly deleteOriginSnapshot: (sessionId: string) => Promise<void>;
	readonly generateBriefing: (input: {
		readonly modelKey: string;
		readonly prompt: string;
		readonly supplement: string;
	}) => Promise<string>;
	readonly persistSeededSession: (
		input: ExternalSessionContinuePersistInput,
	) => Promise<{ readonly sessionId: string; readonly sessionPath: string }>;
	readonly resolveDefaultModelKey: (preferred?: string) => Promise<string>;
	readonly now?: () => number;
	readonly createEntryId?: () => string;
	readonly createSessionId?: () => string;
}

export function createDesktopExternalSessionContinueFrom(
	ports: DesktopExternalSessionContinueFromPorts,
): (request: DesktopExternalSessionContinueRequest) => Promise<ExternalSessionContinueResult> {
	const continueFrom = createCodingAgentExternalSessionContinueFrom(ports);
	return async (request) =>
		continueFrom({
			sessionPath: request.sessionPath,
			modelKey: await ports.resolveDefaultModelKey(request.modelKey),
			...(request.cwdOverride === undefined ? {} : { cwdOverride: request.cwdOverride }),
			...(request.forceCreate === undefined ? {} : { forceCreate: request.forceCreate }),
		});
}

export function pickContinueFromModelKey(input: {
	readonly preferred?: string | null;
	readonly defaultModel?: string | null;
	readonly candidates: readonly ContinueFromModelCandidate[];
}): string | undefined {
	const usable = new Set(
		input.candidates.filter((candidate) => candidate.hasCredentials).map((candidate) => candidate.key),
	);
	return (
		usableContinueFromModelKey(input.preferred, usable) ??
		usableContinueFromModelKey(input.defaultModel, usable) ??
		input.candidates.find((candidate) => candidate.hasCredentials)?.key
	);
}

export async function resolveContinueFromModelKey(
	preferred: string | undefined,
	ports: ContinueFromModelResolverPorts,
): Promise<string> {
	const picked = pickContinueFromModelKey({
		preferred,
		defaultModel: await ports.listDefaultModel(),
		candidates: await ports.listCandidates(),
	});
	if (!picked) throw new Error(DESKTOP_CONTINUE_FROM_ERROR.NO_DEFAULT_MODEL);
	return picked;
}

export function createApplicationExternalBriefingCache(
	cacheService = getApplicationCacheService(),
): ExternalSessionBriefingCache {
	const namespace = cacheService.namespace(BRIEFING_CACHE_NAMESPACE);
	return {
		async get(key) {
			try {
				return await readFile(namespace.path(`${hashBriefingCacheKey(key)}.txt`), "utf8");
			} catch (error) {
				if (isNotFound(error)) return undefined;
				throw error;
			}
		},
		async set(key, briefing) {
			await namespace.ensure();
			await writeFile(namespace.path(`${hashBriefingCacheKey(key)}.txt`), briefing, "utf8");
		},
	};
}

export async function persistDesktopExternalSessionContinueSeed(
	input: ExternalSessionContinuePersistInput,
	ports: {
		readonly resolveSessionDir?: (cwd: string) => string;
		readonly ensureProject?: (cwd: string) => Promise<void>;
		readonly now?: () => number;
	} = {},
): Promise<{ readonly sessionId: string; readonly sessionPath: string }> {
	const sessionId = input.sessionId;
	const targetRootDir = (ports.resolveSessionDir ?? resolveCodingAgentSessionDir)(input.cwd);
	const published = await publishConversationSeed({
		targetRootDir,
		targetSessionId: sessionId,
		createdAt: ports.now?.() ?? input.importedFrom.importedAt,
		cwd: input.cwd,
		entries: input.entries,
		activeLeafId: input.activeLeafId,
		name: input.name,
	});
	await (ports.ensureProject ?? ensureContinueFromProject)(input.cwd);
	emitConversationListChanged({ cwd: input.cwd, sessionPath: published.targetPath });
	return { sessionId: published.targetSessionId, sessionPath: published.targetPath };
}

export async function resolveDesktopContinueFromModelKey(preferred?: string): Promise<string> {
	return resolveContinueFromModelKey(preferred, {
		listDefaultModel: async () => (await getDesktopModelSettingsService().list()).defaultModel,
		listCandidates: listDesktopContinueFromModelCandidates,
	});
}

export async function listDesktopContinueFromModelCandidates(): Promise<ContinueFromModelCandidate[]> {
	const runtime = getOrCreateSharedModelRuntime();
	const candidates: ContinueFromModelCandidate[] = [];
	for (const entry of runtime.getAvailable()) {
		if (!entry.input.includes("text")) continue;
		candidates.push({
			key: `${entry.provider}/${entry.id}`,
			hasCredentials: Boolean(await runtime.getApiKey(entry)),
		});
	}
	return candidates;
}

export async function generateDesktopExternalSessionBriefing(input: {
	readonly modelKey: string;
	readonly prompt: string;
	readonly supplement: string;
}): Promise<string> {
	const modelRuntime = getOrCreateSharedModelRuntime();
	const model = modelRuntime
		.getAvailable()
		.find((entry) => entry.input.includes("text") && `${entry.provider}/${entry.id}` === input.modelKey);
	if (!model) throw new Error(`AI model is not available: ${input.modelKey}`);
	const apiKey = await modelRuntime.getApiKey(model);
	if (!apiKey) throw new Error(`AI model credentials are unavailable: ${input.modelKey}`);
	const response = await completeSimple(
		model,
		{ messages: [{ role: "user", content: input.prompt, timestamp: Date.now() }] },
		{ apiKey },
	);
	const text = response.content
		.filter((content) => content.type === "text")
		.map((content) => content.text)
		.join("")
		.trim();
	if (!text) throw new Error(DESKTOP_CONTINUE_FROM_ERROR.EMPTY_BRIEFING);
	return text;
}

export async function ensureContinueFromProject(cwd: string): Promise<void> {
	const projects = new ProjectService({
		allowProjectRoot,
		createDirectory: createFilesystemDirectory,
		readConfig: readDesktopConfig,
		writeConfig: writeDesktopConfig,
		broadcastChanged: broadcastProjectsChanged,
		isExistingNonDirectory: async (path) => {
			try {
				return !(await stat(path)).isDirectory();
			} catch {
				return false;
			}
		},
	});
	await projects.open(cwd, basename(cwd));
}

export async function findDesktopImportedExternalSessions(
	source: {
		readonly tool: string;
		readonly path: string;
	},
	ports: {
		readonly listProjects: () => Promise<readonly { readonly cwd: string }[]>;
		readonly listSessions: (cwd: string) => Promise<
			readonly {
				readonly id: string;
				readonly path: string;
				readonly cwd: string;
				readonly name?: string;
				readonly importedFrom?: { readonly tool: string; readonly path: string; readonly importedAt: number };
			}[]
		>;
		readonly samePath: (left: string, right: string) => boolean;
	},
): Promise<ExistingImportedExternalSession[]> {
	const matches: ExistingImportedExternalSession[] = [];
	for (const project of await ports.listProjects()) {
		for (const session of await ports.listSessions(project.cwd)) {
			const importedFrom = session.importedFrom;
			if (!importedFrom || importedFrom.tool !== source.tool) continue;
			if (!ports.samePath(importedFrom.path, source.path)) continue;
			matches.push({
				sessionId: session.id,
				sessionPath: session.path,
				cwd: session.cwd,
				importedAt: importedFrom.importedAt,
				...(session.name === undefined ? {} : { name: session.name }),
			});
		}
	}
	return matches;
}

export function createDesktopExternalOriginSnapshotPorts(agentDir = getAgentDir()): {
	readonly copyOriginSnapshot: DesktopExternalSessionContinueFromPorts["copyOriginSnapshot"];
	readonly deleteOriginSnapshot: DesktopExternalSessionContinueFromPorts["deleteOriginSnapshot"];
} {
	const codingRoot = join(agentDir, "tool-results");
	const storage = createNodeResultArtifactStorage({
		codingRoot,
		mcpRoot: join(agentDir, "mcp-results"),
	});
	return {
		async copyOriginSnapshot(input) {
			const root = join(
				resolveNodeSessionArtifactDirectory(codingRoot, input.sessionId),
				EXTERNAL_ORIGIN_SNAPSHOT_DIR,
			);
			await mkdir(root, { recursive: true });
			const sidecarPath = join(root, basename(input.sourceSidecarPath));
			await copyFile(input.sourceSidecarPath, sidecarPath);
			if (!input.sourceBodyPath) {
				return { sessionId: input.sessionId, root, sidecarPath };
			}
			const bodyPath = join(root, basename(input.sourceBodyPath));
			try {
				await copyFile(input.sourceBodyPath, bodyPath);
			} catch (error) {
				if (isNotFound(error)) return { sessionId: input.sessionId, root, sidecarPath };
				throw error;
			}
			return { sessionId: input.sessionId, root, sidecarPath, bodyPath };
		},
		async deleteOriginSnapshot(sessionId) {
			await storage.cleaner.deleteSessionArtifacts(sessionId);
		},
	};
}

function usableContinueFromModelKey(key: string | null | undefined, usable: ReadonlySet<string>): string | undefined {
	if (!key) return undefined;
	return usable.has(key) ? key : undefined;
}

function hashBriefingCacheKey(key: string): string {
	return createHash("sha256").update(key).digest("hex");
}

function isNotFound(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}
