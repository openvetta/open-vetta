import { createHash, randomUUID } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { completeSimple } from "@vetta/ai";
import { resolveCodingAgentSessionDir } from "@vetta/coding-agent/bootstrap";
import {
	createCodingAgentExternalSessionContinueFrom,
	type ExternalSessionBriefingCache,
	type ExternalSessionContinuePersistInput,
	type ExternalSessionContinueRequest,
	type ExternalSessionContinueResult,
	type ExternalSessionFileHost,
} from "@vetta/coding-agent/external-sessions";
import { publishConversationSeed } from "@vetta/runtime-node/conversation";
import { getOrCreateSharedModelRuntime } from "../agent-runtime/host-services.js";
import { getApplicationCacheService } from "../cache/application-cache-service.js";
import { readDesktopConfig, writeDesktopConfig } from "../config/desktop-config-store.js";
import { emitConversationListChanged } from "../conversations/conversation-list-events.js";
import { allowProjectRoot, createFilesystemDirectory } from "../filesystem/filesystem-service.js";
import { getDesktopModelSettingsService } from "../models/model-settings-host.js";
import { broadcastProjectsChanged } from "../projects/project-events.js";
import { ProjectService } from "../projects/project-service.js";
import { getDesktopExternalSessionFormat } from "./desktop-external-session-format.js";

const BRIEFING_CACHE_NAMESPACE = "external-briefing";

export const DESKTOP_CONTINUE_FROM_ERROR = {
	NO_DEFAULT_MODEL: "EXTERNAL_SESSION_CONTINUE_NO_DEFAULT_MODEL",
	EMPTY_BRIEFING: "EXTERNAL_SESSION_CONTINUE_EMPTY_BRIEFING",
} as const;

export interface DesktopExternalSessionContinueFromPorts {
	readonly files: ExternalSessionFileHost;
	readonly cache: ExternalSessionBriefingCache;
	readonly generateBriefing: (input: {
		readonly modelKey: string;
		readonly prompt: string;
		readonly supplement: string;
	}) => Promise<string>;
	readonly persistSeededSession: (
		input: ExternalSessionContinuePersistInput,
	) => Promise<{ readonly sessionId: string; readonly sessionPath: string }>;
	readonly resolveDefaultModelKey: () => Promise<string>;
	readonly now?: () => number;
	readonly createEntryId?: () => string;
}

export function createDesktopExternalSessionContinueFrom(
	ports: DesktopExternalSessionContinueFromPorts,
): (request: Omit<ExternalSessionContinueRequest, "modelKey">) => Promise<ExternalSessionContinueResult> {
	const continueFrom = createCodingAgentExternalSessionContinueFrom(ports);
	return async (request) =>
		continueFrom({
			...request,
			modelKey: await ports.resolveDefaultModelKey(),
		});
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
		readonly createSessionId?: () => string;
		readonly now?: () => number;
	} = {},
): Promise<{ readonly sessionId: string; readonly sessionPath: string }> {
	const sessionId = ports.createSessionId?.() ?? randomUUID();
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

export async function resolveDesktopContinueFromModelKey(): Promise<string> {
	const defaultModel = (await getDesktopModelSettingsService().list()).defaultModel;
	if (!defaultModel) throw new Error(DESKTOP_CONTINUE_FROM_ERROR.NO_DEFAULT_MODEL);
	return defaultModel;
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

export function getDesktopExternalSessionContinueFrom(): (
	request: Omit<ExternalSessionContinueRequest, "modelKey">,
) => Promise<ExternalSessionContinueResult> {
	desktopContinueFrom ??= createDesktopExternalSessionContinueFrom({
		files: getDesktopExternalSessionFormat().host,
		cache: createApplicationExternalBriefingCache(),
		generateBriefing: generateDesktopExternalSessionBriefing,
		persistSeededSession: persistDesktopExternalSessionContinueSeed,
		resolveDefaultModelKey: resolveDesktopContinueFromModelKey,
	});
	return desktopContinueFrom;
}

let desktopContinueFrom: ReturnType<typeof createDesktopExternalSessionContinueFrom> | undefined;

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

function hashBriefingCacheKey(key: string): string {
	return createHash("sha256").update(key).digest("hex");
}

function isNotFound(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}
