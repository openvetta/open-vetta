import type { ProjectEntry } from "./shared.js";

export interface DesktopConfigData {
	projects: ProjectEntry[];
	archivedProjects: ProjectEntry[];
	workspacePath: string;
	vettaAppPath?: string;
	defaultExecutionMode?: "sandbox" | "full-access";
	sandbox?: {
		status: "unknown" | "available" | "unavailable";
		backend: "bundled-bwrap" | "system-bwrap" | "macos-seatbelt" | "windows-host" | null;
		platform: NodeJS.Platform;
		binaryPath?: string;
		reason?: string;
		details?: string;
		checkedAt?: number;
		features?: {
			readRoots: boolean;
			writeRoots: boolean;
			denyRead: boolean;
			denyWrite: boolean;
			tempRootIsolation: boolean;
			networkIsolation: boolean;
			processTreeKill: boolean;
			passiveProbe: boolean;
			activeProbe: boolean;
		};
	};
	linuxSandbox?: {
		status: "unknown" | "available" | "unavailable";
		backend: "bundled-bwrap" | "system-bwrap" | null;
		reason?: string;
		details?: string;
		checkedAt?: number;
	};
	debugMode?: boolean;
	/** 系统通知总开关（「通用设置」）。缺省视为开启。 */
	notificationsEnabled?: boolean;
	/** 实验性功能开关分组（「Agent配置 → 实验性功能」）。缺省视为全部关闭。 */
	experimental?: {
		/** ask_user_question 工具开关。仅对话会话生效，缺省关。 */
		askUserQuestion?: boolean;
		/** Vetta CLI 提示词开关。仅对桌面端对话会话生效，缺省关。 */
		vettaCli?: boolean;
	};
	/** 默认「对话」项目的绝对路径（~/.vetta/conversation），主进程已确保目录存在。 */
	defaultConversationCwd?: string;
	/** im-gateway 自己的 cwd（~/.vetta/im-gateway/conversation），与桌面「对话」物理分家（ADR-0005）。 */
	defaultImConversationCwd?: string;
}

export interface DesktopConfigApi {
	get(): Promise<DesktopConfigData>;
	set(config: Partial<DesktopConfigData>): Promise<void>;
}
