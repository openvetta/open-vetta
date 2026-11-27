import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";
import { atomicWriteJSONAsync } from "@vetta/toolkit/atomic-write";
import { readDesktopConfig } from "../config/desktop-config-store.js";
import { conversationOwnershipCatalog } from "../conversations/conversation-ownership-catalog.js";
import { getAppLogger } from "../logger.js";
import type { ProjectRegistryEntry, SpaceSiblingMirror } from "./sibling-projects.js";
import { SiblingProjectsService } from "./sibling-projects-service.js";

const MIRROR_PATH = resolve(getVettaHomePath(), "space-sibling-projects.v1.json");
/** read 可能密集触发；项目列表与「不属于 Team」的结论最多陈旧这么久。 */
const CACHE_TTL_MS = 2_000;

const log = getAppLogger("spaces");

function isMissingFile(error: unknown): boolean {
	return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT";
}

export async function loadSpaceSiblingMirror(path = MIRROR_PATH): Promise<unknown> {
	try {
		const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			(parsed as { schemaVersion?: unknown }).schemaVersion === 1
		) {
			return (parsed as { mirror?: unknown }).mirror;
		}
		return undefined;
	} catch (error) {
		if (isMissingFile(error)) return undefined;
		throw error;
	}
}

export function saveSpaceSiblingMirror(mirror: SpaceSiblingMirror, path = MIRROR_PATH): Promise<void> {
	return atomicWriteJSONAsync(path, { schemaVersion: 1, mirror });
}

function createActiveProjectsReader(now: () => number = Date.now): () => Promise<readonly ProjectRegistryEntry[]> {
	let cached: { at: number; value: Promise<readonly ProjectRegistryEntry[]> } | undefined;
	return () => {
		const at = now();
		if (!cached || at - cached.at > CACHE_TTL_MS) {
			const value = readDesktopConfig().then((config) => config.projects.map(({ path, name }) => ({ path, name })));
			cached = { at, value };
			value.catch(() => {
				if (cached?.value === value) cached = undefined;
			});
		}
		return cached.value;
	};
}

function createTeamSessionReader(now: () => number = Date.now): (sessionPath: string) => Promise<string | undefined> {
	// 会话文件一旦归属某个 Team 会话就不会改变，命中可永久缓存；未命中只短暂缓存，
	// 因为 Team 会话的登记可能晚于成员第一次 read。
	const owners = new Map<string, string>();
	const misses = new Map<string, number>();
	return async (sessionPath) => {
		const owner = owners.get(sessionPath);
		if (owner) return owner;
		const missedAt = misses.get(sessionPath);
		if (missedAt !== undefined && now() - missedAt <= CACHE_TTL_MS) return undefined;
		const teamSessionId = (await conversationOwnershipCatalog.getOwner(sessionPath))?.teamSessionId;
		if (teamSessionId) {
			owners.set(sessionPath, teamSessionId);
			misses.delete(sessionPath);
		} else {
			misses.set(sessionPath, now());
		}
		return teamSessionId;
	};
}

let instance: SiblingProjectsService | undefined;

/** 进程内唯一的兄弟项目服务（ADR-0159）。 */
export function getSiblingProjectsService(): SiblingProjectsService {
	instance ??= new SiblingProjectsService({
		readActiveProjects: createActiveProjectsReader(),
		readTeamSessionId: createTeamSessionReader(),
		loadMirror: () => loadSpaceSiblingMirror(),
		saveMirror: (mirror) => saveSpaceSiblingMirror(mirror),
		log,
	});
	return instance;
}
