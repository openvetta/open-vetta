import { pathBasename } from "@shared/lib/utils";
import type { Project, SessionInfo } from "@shared/store/atoms";
import type { RuntimeSessionAccess } from "@vetta/runtime-core";
import type { DesktopSessionSearchResult } from "@/shared/session-search";

/** 侧栏里乐观创建的条目可能还没解析访问能力；它就在侧栏里能打开，按完全可访问处理。 */
const OPENABLE_ACCESS: RuntimeSessionAccess = { readHistory: true, resume: true, rename: true, delete: true };

/**
 * 从侧栏已加载的会话列表里找出指定会话，拼成与检索结果同形的条目。
 *
 * 命令面板空查询时要展示的会话（进行中 / 最近打开）几乎都已经在侧栏内存里：「对话」始终加载，
 * 用户打开或正在跑的项目会话所在项目通常也展开过。直接取用就不必为它们走检索——检索要把来源目录下
 * 每个会话文件完整解析一遍，「对话」目录装着全部对话，单次就要数秒。标题也随侧栏实时更新。
 *
 * 找不到的路径原样留给调用方去检索。
 */
export interface SidebarSessionContext {
	readonly sessionsByBucket: ReadonlyMap<string, readonly SessionInfo[]>;
	readonly projects: readonly Project[];
	readonly defaultConversationCwd: string;
	readonly imConversationCwd: string;
}

export function findSidebarSessions(
	paths: readonly string[],
	context: SidebarSessionContext,
): Map<string, DesktopSessionSearchResult> {
	const wanted = new Set(paths);
	const found = new Map<string, DesktopSessionSearchResult>();
	if (wanted.size === 0) return found;
	for (const [bucket, sessions] of context.sessionsByBucket) {
		for (const session of sessions) {
			if (!wanted.has(session.path) || found.has(session.path)) continue;
			found.set(session.path, toResult(bucket, session, context));
		}
	}
	return found;
}

function toResult(bucket: string, session: SessionInfo, context: SidebarSessionContext): DesktopSessionSearchResult {
	const project = context.projects.find((candidate) => candidate.cwd === bucket);
	const sourceKind =
		context.imConversationCwd && session.cwd === context.imConversationCwd
			? "claw"
			: bucket === context.defaultConversationCwd || project?.isDefault
				? "conversation"
				: project?.type === "batch"
					? "batch"
					: "project";
	return {
		session: {
			id: session.id,
			path: session.path,
			cwd: session.cwd,
			name: session.name,
			firstMessage: session.firstMessage,
			modifiedAt: session.modifiedAt,
			access: session.access ?? OPENABLE_ACCESS,
			parentSessionPath: session.parentSessionPath,
			parentEntryId: session.parentEntryId,
		},
		sourceCwd: bucket,
		sourceKind,
		sourceName:
			sourceKind === "project" || sourceKind === "batch" ? project?.name || pathBasename(bucket) : undefined,
		match: { field: "title", snippet: session.name ?? "" },
	};
}
