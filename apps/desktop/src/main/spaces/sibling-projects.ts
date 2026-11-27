/**
 * 工作空间内的兄弟项目（ADR-0159）：纯规则部分。
 *
 * 归属以 Renderer 推来的空间镜像为准（ADR-0155 的数据仍只由 Renderer 写），项目名称、
 * 归档与远程信息以 Main 自己的项目注册表为准。这里不碰 IO，便于穷举测试。
 */
import { resolve } from "node:path";
import type { ConversationDocument } from "@vetta/runtime-core";
import { parseProjectLocation } from "@vetta/ssh-transport";

/** 写进会话的上下文记录类型；读回「上次告知过什么」也靠它。 */
export const SIBLING_PROJECTS_CONTEXT_TYPE = "space_sibling_projects";
/** 提示词里最多列出的项目数；读放行不受此限。 */
export const SIBLING_PROJECTS_PROMPT_LIMIT = 20;

export interface SpaceSiblingSettings {
	readonly id: string;
	/** 该空间是否让会话看见兄弟项目。 */
	readonly siblingProjects: boolean;
}

/** Renderer 推来的空间归属只读镜像。只含自定义空间；主空间不出现在这里。 */
export interface SpaceSiblingMirror {
	readonly spaces: readonly SpaceSiblingSettings[];
	/** 项目路径 → 空间 id。 */
	readonly projects: Readonly<Record<string, string>>;
	/** 独立普通会话的会话文件路径，或独立 Team 的 Team 会话 id → 空间 id。 */
	readonly conversations: Readonly<Record<string, string>>;
}

export const EMPTY_SPACE_SIBLING_MIRROR: SpaceSiblingMirror = Object.freeze({
	spaces: Object.freeze([]),
	projects: Object.freeze({}),
	conversations: Object.freeze({}),
});

export interface ProjectRegistryEntry {
	readonly path: string;
	readonly name?: string;
}

export interface SiblingProject {
	readonly name: string;
	readonly path: string;
}

/** 推导会话所属空间所需的会话事实。 */
export interface SessionPlacement {
	/** 会话运行 cwd。 */
	readonly cwd?: string;
	/** 会话文件路径。 */
	readonly sessionPath?: string;
	/** 会话属于某个 Agent Team 会话时的 Team 会话 id。 */
	readonly teamSessionId?: string;
}

const MAIN_SPACE = "main";

type ConversationDocumentEntry = ConversationDocument["entries"][number];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 宽松解析镜像：坏条目逐条丢弃，不让一条脏数据废掉整份。
 * 指向未知空间或主空间的归属一律视为不存在（等同主空间）。
 */
export function parseSpaceSiblingMirror(value: unknown): SpaceSiblingMirror {
	if (!isRecord(value)) return EMPTY_SPACE_SIBLING_MIRROR;
	const spaces: SpaceSiblingSettings[] = [];
	const ids = new Set<string>();
	for (const item of Array.isArray(value.spaces) ? value.spaces : []) {
		if (!isRecord(item) || typeof item.id !== "string" || !item.id || item.id === MAIN_SPACE || ids.has(item.id)) {
			continue;
		}
		ids.add(item.id);
		spaces.push({ id: item.id, siblingProjects: item.siblingProjects !== false });
	}
	const memberships = (entries: unknown): Record<string, string> => {
		const result: Record<string, string> = {};
		if (!isRecord(entries)) return result;
		for (const [key, spaceId] of Object.entries(entries)) {
			if (!key || typeof spaceId !== "string" || !ids.has(spaceId)) continue;
			Object.defineProperty(result, key, { value: spaceId, enumerable: true, configurable: true, writable: true });
		}
		return result;
	};
	return { spaces, projects: memberships(value.projects), conversations: memberships(value.conversations) };
}

type LocalProject = { readonly kind: "local"; readonly key: string; readonly entry: ProjectRegistryEntry };

function localKey(path: string): string | undefined {
	try {
		const location = parseProjectLocation(path);
		if (location.kind !== "local") return undefined;
		return location.path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
	} catch {
		return undefined;
	}
}

function toLocalProjects(entries: readonly ProjectRegistryEntry[]): LocalProject[] {
	const result: LocalProject[] = [];
	for (const entry of entries) {
		if (typeof entry.path !== "string" || !entry.path) continue;
		const key = localKey(entry.path);
		if (key !== undefined) result.push({ kind: "local", key, entry });
	}
	return result;
}

function sessionPathKey(path: string): string {
	const absolute = resolve(path);
	return process.platform === "win32" || process.platform === "darwin" ? absolute.toLowerCase() : absolute;
}

function membershipOf(
	memberships: Readonly<Record<string, string>>,
	key: string,
	normalize: (value: string) => string,
) {
	if (Object.hasOwn(memberships, key)) return memberships[key];
	const target = normalize(key);
	for (const [candidate, spaceId] of Object.entries(memberships)) {
		if (normalize(candidate) === target) return spaceId;
	}
	return undefined;
}

function projectMembership(mirror: SpaceSiblingMirror, project: LocalProject): string | undefined {
	return membershipOf(mirror.projects, project.entry.path, (value) => localKey(value) ?? value);
}

export interface SessionSpace {
	readonly spaceId: string;
	/** 会话自己所在的项目；它不算兄弟项目。 */
	readonly selfProjectPath?: string;
}

/**
 * 会话所属的自定义空间；主空间、未知空间或无法判断时返回 `undefined`。
 *
 * 判定顺序：远程 cwd 直接排除 → cwd 恰好是某个本机项目（项目会话、固定到项目的 Team）
 * → Team 会话 id → 会话文件路径（独立对话）。项目匹配用精确相等而非「cwd 在项目内」：
 * 有人会把主目录登记成项目，包含判定会把所有「对话」会话都错算成它的会话。
 */
export function resolveSessionSpace(
	mirror: SpaceSiblingMirror,
	activeProjects: readonly ProjectRegistryEntry[],
	placement: SessionPlacement,
): SessionSpace | undefined {
	const cwd = placement.cwd;
	if (cwd !== undefined && localKey(cwd) === undefined) return undefined;
	const cwdKey = cwd === undefined ? undefined : localKey(cwd);
	if (cwdKey !== undefined) {
		const own = toLocalProjects(activeProjects).find((project) => project.key === cwdKey);
		if (own) {
			const spaceId = projectMembership(mirror, own);
			return spaceId ? { spaceId, selfProjectPath: own.entry.path } : undefined;
		}
	}
	if (placement.teamSessionId) {
		const spaceId = membershipOf(mirror.conversations, placement.teamSessionId, (value) => value);
		if (spaceId) return { spaceId };
	}
	if (placement.sessionPath) {
		const spaceId = membershipOf(mirror.conversations, placement.sessionPath, sessionPathKey);
		if (spaceId) return { spaceId };
	}
	return undefined;
}

function projectName(entry: ProjectRegistryEntry): string {
	const name = entry.name?.trim();
	if (name) return name;
	const parts = entry.path.replace(/[\\/]+$/, "").split(/[\\/]/);
	return parts[parts.length - 1] || entry.path;
}

/**
 * 会话当前可见的兄弟项目，按项目注册表（侧栏）顺序。
 * 空间开关关闭、会话在主空间或远程项目里时为空。
 */
export function listSiblingProjects(
	mirror: SpaceSiblingMirror,
	activeProjects: readonly ProjectRegistryEntry[],
	placement: SessionPlacement,
): SiblingProject[] {
	const space = resolveSessionSpace(mirror, activeProjects, placement);
	if (!space) return [];
	const settings = mirror.spaces.find((candidate) => candidate.id === space.spaceId);
	if (!settings?.siblingProjects) return [];
	const selfKey = space.selfProjectPath ? localKey(space.selfProjectPath) : undefined;
	const seen = new Set<string>();
	const siblings: SiblingProject[] = [];
	for (const project of toLocalProjects(activeProjects)) {
		if (project.key === selfKey || seen.has(project.key)) continue;
		if (projectMembership(mirror, project) !== space.spaceId) continue;
		seen.add(project.key);
		siblings.push({ name: projectName(project.entry), path: project.entry.path });
	}
	return siblings;
}

function identity(projects: readonly SiblingProject[]): string {
	return projects
		.map((project) => `${localKey(project.path) ?? project.path}\u0000${project.name}`)
		.sort()
		.join("\u0001");
}

/** 两份清单是否等价：只看集合（路径 + 名称），不看顺序，避免排序变化反复追加。 */
export function sameSiblingProjects(left: readonly SiblingProject[], right: readonly SiblingProject[]): boolean {
	return left.length === right.length && identity(left) === identity(right);
}

/** 给模型看的上下文正文。模型侧文案统一用英文，与其他工作区事实一致。 */
export function renderSiblingProjectsContext(projects: readonly SiblingProject[]): string {
	if (projects.length === 0) {
		return [
			"<workspace_sibling_projects>",
			"The sibling projects listed earlier are no longer part of this conversation's Vetta workspace. Do not assume access to them; reading them now requires the user's approval again.",
			"</workspace_sibling_projects>",
		].join("\n");
	}
	const listed = projects.slice(0, SIBLING_PROJECTS_PROMPT_LIMIT);
	const hidden = projects.length - listed.length;
	return [
		"<workspace_sibling_projects>",
		"These projects share this conversation's Vetta workspace (current as of this message; it replaces any earlier list). You may read files in them with the read tool without asking; writing to them still needs the user's approval. Use them when the task relates to them, and do not explore them otherwise.",
		...listed.map((project) => `- ${project.name}: ${project.path}`),
		...(hidden > 0
			? [`- …and ${hidden} more project${hidden === 1 ? "" : "s"} in this workspace, not listed here.`]
			: []),
		"</workspace_sibling_projects>",
	].join("\n");
}

function readProjects(details: unknown): SiblingProject[] | undefined {
	if (!isRecord(details) || !Array.isArray(details.projects)) return undefined;
	const projects: SiblingProject[] = [];
	for (const item of details.projects) {
		if (!isRecord(item) || typeof item.name !== "string" || typeof item.path !== "string") return undefined;
		projects.push({ name: item.name, path: item.path });
	}
	return projects;
}

function activeBranch(document: ConversationDocument): ConversationDocumentEntry[] {
	const byId = new Map(document.entries.map((entry) => [entry.id, entry]));
	const branch: ConversationDocumentEntry[] = [];
	const visited = new Set<string>();
	let current = document.activeLeafId ? byId.get(document.activeLeafId) : undefined;
	while (current && !visited.has(current.id)) {
		visited.add(current.id);
		branch.push(current);
		current = current.parentId ? byId.get(current.parentId) : undefined;
	}
	return branch.reverse();
}

/**
 * 当前分支上 Agent 最近一次被告知、且仍在上下文里的兄弟项目清单。
 *
 * 只看当前分支：编辑旧消息切出的新分支上没有告知记录，就该重新告知。告知记录若早于
 * 最近一次压缩保留的起点，它已被摘要掉，视为未告知（返回空）。
 */
export function readToldSiblingProjects(document: ConversationDocument): SiblingProject[] {
	const branch = activeBranch(document);
	let noteIndex = -1;
	for (let index = branch.length - 1; index >= 0; index -= 1) {
		const entry = branch[index];
		if (entry?.type === "custom_message" && entry.customType === SIBLING_PROJECTS_CONTEXT_TYPE) {
			noteIndex = index;
			break;
		}
	}
	if (noteIndex === -1) return [];
	for (let index = branch.length - 1; index > noteIndex; index -= 1) {
		const entry = branch[index];
		if (entry?.type !== "compaction") continue;
		const keptFrom = branch.findIndex((candidate) => candidate.id === entry.firstKeptEntryId);
		if (keptFrom === -1 || keptFrom > noteIndex) return [];
		break;
	}
	const note = branch[noteIndex];
	return (note?.type === "custom_message" ? readProjects(note.details) : undefined) ?? [];
}
