import { readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getAppLogger } from "../logger.js";
import { emitConversationListChanged } from "./conversation-list-events.js";
import { assertOrdinaryConversationPath } from "./conversation-ownership-guard.js";
import { forgetConversations } from "./conversation-tags-store.js";
import { isConversationSubCwd, readSessionCwdFromHeader, resolveSessionListCwd } from "./session-paths.js";
import { forgetSessionPins } from "./session-pins-store.js";

const log = getAppLogger("session");

export interface DesktopSessionCommandsDependencies {
	readonly runtime: {
		deleteSession(sessionPath: string): Promise<void>;
		renameSession(sessionPath: string, name: string): Promise<void>;
	};
	/** 自动化在 scheduler 里，它反过来依赖本目录，所以由调用方接上（ADR-0127）。 */
	readonly onSessionsDeleted: (isDeleted: (sessionPath: string) => boolean) => void;
	/** 消息问答批注挂着模型运行时，同样由调用方接上。 */
	readonly forgetAnnotations: (sessionPath: string) => Promise<void>;
	readonly assertOrdinary?: (sessionPath: string) => Promise<unknown>;
	readonly readSessionCwd?: (sessionPath: string) => Promise<string | undefined>;
	readonly removeDirectory?: (dir: string) => Promise<void>;
	readonly forgetUserMarks?: (sessionPaths: readonly string[]) => void;
	readonly emitListChanged?: typeof emitConversationListChanged;
}

export interface DesktopSessionCommands {
	/**
	 * 删除会话文件及其全部附属：会话工作目录（含产物）、置顶、标签、批注、自动化绑定，并通知会话列表。
	 *
	 * 工作目录必须跟着会话一起消失。只删 jsonl 会在 `~/.vetta/conversation` 下留下看不见的 uuid 目录，
	 * 越删越多；而单会话删除、清空会话、移除空间都从同一份会话列表出发，只在某一个入口回收
	 * 会让其余入口继续制造尾巴，所以由这一处统一承担。
	 */
	delete(sessionPath: string): Promise<void>;
	rename(sessionPath: string, name: string): Promise<void>;
}

/**
 * 普通会话的删除与重命名。侧边栏（IPC）和配对的手机（远程镜像）共用这一份，
 * 手机上删改的会话才会同样清理干净、出现在侧边栏里。只接受普通会话：
 * Agent Team 名下的会话由团队自己管理。
 */
export function createDesktopSessionCommands(deps: DesktopSessionCommandsDependencies): DesktopSessionCommands {
	const assertOrdinary = deps.assertOrdinary ?? assertOrdinaryConversationPath;
	const readSessionCwd = deps.readSessionCwd ?? readSessionCwdFromHeader;
	const removeDirectory = deps.removeDirectory ?? ((dir) => rm(dir, { recursive: true, force: true }));
	const forgetUserMarks =
		deps.forgetUserMarks ??
		((paths) => {
			forgetSessionPins(paths);
			forgetConversations(paths);
		});
	const emitListChanged = deps.emitListChanged ?? emitConversationListChanged;

	const notifyList = (sessionPath: string, cwd: string | undefined): void => {
		if (cwd) emitListChanged({ cwd: resolveSessionListCwd(cwd), sessionPath });
	};

	return {
		async delete(sessionPath) {
			await assertOrdinary(sessionPath);
			// ADR-0007: 「对话」项目下的 session cwd 是独立子目录；删除 session 时
			// 连带回收子目录里的产物。读 header 先取 cwd，再 delete，最后 rm 子目录。
			const cwd = await readSessionCwd(sessionPath);
			await deps.runtime.deleteSession(sessionPath);
			await deps.forgetAnnotations(sessionPath);
			deps.onSessionsDeleted((path) => path === sessionPath);
			forgetUserMarks([sessionPath]);
			if (cwd && isConversationSubCwd(cwd)) {
				await removeDirectory(resolve(cwd)).catch((error: unknown) => {
					log.error("failed to remove conversation sub cwd", cwd, error);
				});
			}
			notifyList(sessionPath, cwd);
		},
		async rename(sessionPath, name) {
			await assertOrdinary(sessionPath);
			await deps.runtime.renameSession(sessionPath, name);
			notifyList(sessionPath, await readSessionCwd(sessionPath));
		},
	};
}

/** 会话目录第一层的 session 文件；`.vetta/sessions` 下的子目录不属于单个会话。 */
export async function listSessionFiles(dir: string): Promise<string[]> {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
			.map((entry) => join(dir, entry.name));
	} catch {
		return [];
	}
}

/**
 * 清空一个会话目录：逐条走会话删除，工作目录、置顶、标签、批注、自动化绑定都跟着回收。
 * 单个失败不能阻断整体清理（比如 Agent Team 名下的会话会拒绝删除），由调用方记录。
 */
export async function deleteSessionsInDirectory(options: {
	dir: string;
	commands: Pick<DesktopSessionCommands, "delete">;
	onError: (sessionPath: string, error: unknown) => void;
	listFiles?: (dir: string) => Promise<string[]>;
}): Promise<void> {
	const listFiles = options.listFiles ?? listSessionFiles;
	for (const sessionPath of await listFiles(options.dir)) {
		try {
			await options.commands.delete(sessionPath);
		} catch (error) {
			options.onError(sessionPath, error);
		}
	}
}
