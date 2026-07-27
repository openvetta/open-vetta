import type { HistoryEntry, ProjectInfo, SessionHistoryInfo } from "../contracts.js";

/** 进程级共享模型资源；具体 Registry 只存在于 Composition Adapter。 */
export interface RuntimeSharedModelController {
	refreshAuth(token: string | undefined): Promise<void>;
	refreshInBackground(): void;
}

/** 离线会话目录服务；不负责活动 Session 的创建、锁或生命周期。 */
export interface RuntimeSessionCatalog {
	listProjects(): Promise<readonly ProjectInfo[]>;
	listSessions(cwd: string, sessionDir?: string): Promise<readonly SessionHistoryInfo[]>;
	renameSession(sessionPath: string, name: string): Promise<void>;
	deleteSessionArtifacts(sessionPath: string): Promise<void>;
}

/** 直接读取既有会话文件；保留当前同步 API 和不获取写锁的行为。 */
export interface RuntimeSessionFileHistoryReader {
	read(sessionPath: string): { history: HistoryEntry[] };
}
