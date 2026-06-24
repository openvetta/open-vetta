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
	/** 实验性功能开关分组（「Agent配置 → 扩展功能」）。缺省视为全部开启。 */
	experimental?: {
		/** Vetta CLI 提示词开关。仅对桌面端对话会话生效，缺省开。 */
		vettaCli?: boolean;
		/** 输入预测开关。缺省关；批量/流转会话不适用。 */
		promptPrediction?: boolean;
		/** 适配通用 Agent Skill 开关。发现 ~/.agents/skills 与 <cwd>/.agents/skills，缺省开。 */
		agentSkills?: boolean;
	};
	/** 默认「对话」项目的绝对路径（~/.vetta/conversation），主进程已确保目录存在。 */
	defaultConversationCwd?: string;
	/** im-gateway 自己的 cwd（~/.vetta/im-gateway/conversation），与桌面「对话」物理分家（ADR-0005）。 */
	defaultImConversationCwd?: string;
	/** 知识库加工设置。 */
	knowledgeBase?: {
		/** 知识库总开关。缺省开。关闭后禁用知识库工具、隐藏「知识检索」、停后台加工。 */
		enabled?: boolean;
		/** 轮询间隔（分钟）：3 / 5 / 10 / 30。缺省 5。后台加工跟随总开关。 */
		pollIntervalMinutes?: number;
		/** 加工会话使用的模型 key（provider/modelId）。缺省跟随默认模型。 */
		processingModelKey?: string;
		/** 并发加工会话数（网络/LLM 限流）。缺省 3。 */
		agentConcurrency?: number;
		/** 并发本地 OCR 子进程数（CPU 限流）。缺省 1。 */
		ocrConcurrency?: number;
	};
	/** 知识库加工特殊项目的绝对路径（~/.vetta/knowledges/processing_records）。 */
	knowledgeProcessingCwd?: string;
}

export interface DesktopConfigApi {
	get(): Promise<DesktopConfigData>;
	set(config: Partial<DesktopConfigData>): Promise<void>;
}
