import { isSubPath } from "@shared/lib/utils";
import { MAIN_SPACE, type SpaceState } from "@shared/store/spaces";

/** 一条会话对所属工作空间的贡献；同一会话可以既在运行也在等用户。 */
export interface SpaceActivityEntry {
	readonly sessionPath: string;
	readonly running: boolean;
	readonly waiting: boolean;
	/**
	 * 会话所在的工作目录。首页（默认对话）会话与团队会话没有可用的 cwd 时留空，
	 * 归因会退回会话所属工作空间的映射或主工作空间。
	 */
	readonly cwd?: string;
}

export interface SpaceActivity {
	/** 运行中的会话数。 */
	readonly running: number;
	/** 正在等用户处理的请求数（一个会话可能挂着多个）。 */
	readonly waiting: number;
}

export interface SpaceActivityInput {
	readonly activity: readonly SpaceActivityEntry[];
	readonly spaces: Pick<SpaceState, "projects" | "conversations">;
	/** 已知项目目录；用于把会话路径反推回它所属的项目。 */
	readonly projectCwds: readonly string[];
	/** 默认对话目录；它的会话在侧栏里独立成段，不隶属任何项目。 */
	readonly defaultCwd: string;
	/** 会话路径 → 所属工作空间（团队会话按 placement 解析，调用方先算好）。 */
	readonly spaceByPath?: ReadonlyMap<string, string>;
	/** 会话路径 → cwd。侧栏已加载的会话用它兜底，覆盖主进程没给 cwd 的情况。 */
	readonly cwdByPath?: ReadonlyMap<string, string>;
}

/**
 * 把「哪些会话在跑、哪些在等用户」汇总成每个工作空间的计数。
 *
 * 归因规则与侧栏展示保持一致：显式的 `conversations` 归属优先（独立会话可以跨空间移动），
 * 否则按 cwd 找项目、再查项目的工作空间归属，都没有就落在主工作空间。
 */
export function summarizeSpaceActivity({
	activity,
	spaces,
	projectCwds,
	defaultCwd,
	spaceByPath,
	cwdByPath,
}: SpaceActivityInput): Map<string, SpaceActivity> {
	const summary = new Map<string, { running: number; waiting: number }>();
	for (const entry of activity) {
		if (!entry.running && !entry.waiting) continue;
		const spaceId = resolveSpaceOfSession(entry.sessionPath, entry.cwd, {
			spaces,
			projectCwds,
			defaultCwd,
			spaceByPath,
			cwdByPath,
		});
		const current = summary.get(spaceId) ?? { running: 0, waiting: 0 };
		summary.set(spaceId, {
			running: current.running + (entry.running ? 1 : 0),
			waiting: current.waiting + (entry.waiting ? 1 : 0),
		});
	}
	return summary;
}

function resolveSpaceOfSession(
	sessionPath: string,
	explicitCwd: string | undefined,
	context: Omit<SpaceActivityInput, "activity">,
): string {
	const explicitSpace = context.spaceByPath?.get(sessionPath);
	if (explicitSpace) return explicitSpace;

	const memberSpace = Object.hasOwn(context.spaces.conversations, sessionPath)
		? context.spaces.conversations[sessionPath]
		: undefined;
	if (memberSpace) return memberSpace;

	const cwd = explicitCwd ?? context.cwdByPath?.get(sessionPath) ?? cwdFromSessionPath(sessionPath, context);
	// 默认对话目录的会话在侧栏里是独立的一段，不属于任何项目。
	if (!cwd || cwd === context.defaultCwd) return MAIN_SPACE;
	return projectSpaceOf(context.spaces, cwd) ?? MAIN_SPACE;
}

/** 会话文件放在 `<cwd>/.vetta/sessions/` 下，按已知目录反推所属 cwd（最长匹配优先）。 */
function cwdFromSessionPath(sessionPath: string, context: Omit<SpaceActivityInput, "activity">): string | undefined {
	const candidates = [...context.projectCwds, context.defaultCwd].filter((cwd) => cwd.length > 0);
	const matched = candidates
		.filter((cwd) => isSubPath(sessionPath, cwd))
		.sort((left, right) => right.length - left.length)[0];
	return matched;
}

/** 项目目录 → 所属工作空间；未登记的目录没有归属。 */
export function projectSpaceOf(spaces: Pick<SpaceState, "projects">, cwd: string): string | undefined {
	return Object.hasOwn(spaces.projects, cwd) ? spaces.projects[cwd] : undefined;
}
