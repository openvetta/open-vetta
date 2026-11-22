import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { UNAVAILABLE_RUNTIME_SESSION_ACCESS } from "../../shared/session-access.js";
import { getProject } from "../batch-tasks/batch-task-storage.js";
import {
	DEFAULT_CONVERSATION_CWD,
	DEFAULT_IM_CONVERSATION_CWD,
	readDesktopConfig,
} from "../config/desktop-config-store.js";
import { isConversationCwd, resolveSessionDirForCwd } from "./session-paths.js";
import type { SessionSearchSource } from "./session-search-service.js";

export async function listDesktopSessionSearchSources(): Promise<SessionSearchSource[]> {
	const config = await readDesktopConfig();
	const sources: SessionSearchSource[] = [
		{
			cwd: DEFAULT_CONVERSATION_CWD,
			kind: "conversation",
			sessionDir: resolveSessionDirForCwd(DEFAULT_CONVERSATION_CWD),
		},
		{
			cwd: DEFAULT_IM_CONVERSATION_CWD,
			kind: "claw",
			sessionDir: resolveSessionDirForCwd(DEFAULT_IM_CONVERSATION_CWD),
		},
	];
	for (const { path, name } of config.projects) {
		let batch = false;
		try {
			const meta: unknown = JSON.parse(await readFile(join(path, ".vetta", "meta.json"), "utf8"));
			batch = typeof meta === "object" && meta !== null && Reflect.get(meta, "type") === "batch";
		} catch {
			/* Missing project metadata denotes a regular project. */
		}
		if (!batch) {
			sources.push({ cwd: path, kind: "project", name });
			continue;
		}
		// Read only registered projects; discovery can auto-register folders and must not run during search.
		const project = await getProject(path);
		if (!project) continue;
		const tasks = project.tasks.filter((task) => task.sessionPath);
		sources.push({
			cwd: path,
			kind: "batch",
			name: project.name,
			sessions: tasks.flatMap((task) =>
				task.sessionPath
					? [
							{
								id: task.id,
								path: task.sessionPath,
								cwd: task.cwd,
								name: task.name || undefined,
								firstMessage: task.name || task.id,
								modifiedAt: task.updatedAt,
								access: UNAVAILABLE_RUNTIME_SESSION_ACCESS,
							},
						]
					: [],
			),
			executionModeByPath: new Map(
				tasks.flatMap((task) =>
					task.sessionPath && task.executionMode ? [[resolve(task.sessionPath), task.executionMode] as const] : [],
				),
			),
		});
	}
	return [...new Map(sources.map((source) => [resolve(source.cwd), source])).values()];
}

function isWithin(child: string, parent: string): boolean {
	const rel = relative(resolve(parent), resolve(child));
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * 只列「进行中 / 最近打开」这几个会话时，不该把所有项目的会话目录都解析一遍——列目录会完整读取
 * 并解析其中每个会话文件，项目一多就是数秒。用会话头里的 cwd（唯一可靠的归属来源，见
 * session.ts 的 LIST_RUNNING_CWDS）把来源收窄到真正包含这些会话的那几个。
 *
 * `cwds` 里出现 undefined（头读不出来）时无法判断归属，原样返回全部来源，宁慢勿漏。
 * 批量任务的会话列表本来就随来源内联、不读目录，始终保留。
 */
export function narrowSessionSearchSources(
	sources: readonly SessionSearchSource[],
	cwds: readonly (string | undefined)[],
): SessionSearchSource[] {
	if (cwds.some((cwd) => cwd === undefined)) return [...sources];
	const known = cwds.filter((cwd): cwd is string => cwd !== undefined);
	return sources.filter((source) => {
		switch (source.kind) {
			case "batch":
				return true;
			case "conversation":
				return known.some((cwd) => isConversationCwd(cwd));
			case "claw":
				return known.some((cwd) => isWithin(cwd, DEFAULT_IM_CONVERSATION_CWD));
			default:
				return known.some((cwd) => resolve(cwd) === resolve(source.cwd));
		}
	});
}
