import { readDesktopConfig } from "../config/desktop-config-store.js";
import { conversationOwnershipCatalog } from "../conversations/conversation-ownership-catalog.js";
import { getAppLogger } from "../logger.js";
import type { ProjectRegistryEntry } from "./sibling-projects.js";
import { SiblingProjectsService } from "./sibling-projects-service.js";
import { getSpaceStore } from "./space-store-instance.js";

/** read 可能密集触发；项目列表与「不属于 Team」的结论最多陈旧这么久。 */
const CACHE_TTL_MS = 2_000;

const log = getAppLogger("spaces");

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
		readSpaces: async () => (await getSpaceStore().read()).data,
		log,
	});
	return instance;
}
