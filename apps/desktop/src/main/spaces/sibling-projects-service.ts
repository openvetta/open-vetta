import type { ConversationDocument, PromptRequest } from "@vetta/runtime-core";
import type { SessionContextRecord } from "@vetta/runtime-core/kernel";
import {
	listSiblingProjects,
	type ProjectRegistryEntry,
	parseSpaceSiblingMirror,
	readToldSiblingProjects,
	renderSiblingProjectsContext,
	SIBLING_PROJECTS_CONTEXT_TYPE,
	type SiblingProject,
	sameSiblingProjects,
} from "./sibling-projects.js";

/** 服务只需要 RuntimeHost 的这几项只读能力。 */
export interface SiblingProjectsRuntimePort {
	getSessionPath(sessionId: string): string | undefined;
	readSessionWorkingDirectory(sessionId: string): string | undefined;
	readSessionDocument(sessionId: string): ConversationDocument;
}

export interface SiblingProjectsLogger {
	warn(message: string, details?: unknown): void;
}

export interface SiblingProjectsServiceDependencies {
	/** 未归档的项目，按侧栏顺序。 */
	readonly readActiveProjects: () => Promise<readonly ProjectRegistryEntry[]>;
	/** 会话文件属于某个 Agent Team 会话时返回该 Team 会话 id。 */
	readonly readTeamSessionId: (sessionPath: string) => Promise<string | undefined>;
	/** 主进程工作空间存储里的空间与归属（ADR-0160）。 */
	readonly readSpaces: () => Promise<unknown>;
	readonly log?: SiblingProjectsLogger;
}

/**
 * 同空间兄弟项目的主进程侧（ADR-0159）。
 *
 * - 空间归属直接读主进程的工作空间存储（ADR-0160），手机、自动化等不经窗口的轮次也能算；
 * - 沙箱在 read 越界时实时询问 {@link readRoots}；
 * - 每轮 prompt 前 {@link decoratePrompt} 按变化追加一条只给模型看的上下文。
 *
 * 任何失败都不能拖垮对话：读放行失败回到授权弹窗，装饰失败原样发出 prompt。
 */
export class SiblingProjectsService {
	private runtime: SiblingProjectsRuntimePort | undefined;

	constructor(private readonly dependencies: SiblingProjectsServiceDependencies) {}

	attachRuntime(runtime: SiblingProjectsRuntimePort): void {
		this.runtime = runtime;
	}

	/** 会话当前可见的兄弟项目，按侧栏顺序。 */
	async listForSession(sessionId: string): Promise<SiblingProject[]> {
		const runtime = this.runtime;
		if (!runtime || !sessionId) return [];
		const cwd = runtime.readSessionWorkingDirectory(sessionId);
		const sessionPath = runtime.getSessionPath(sessionId);
		const [spaces, activeProjects, teamSessionId] = await Promise.all([
			this.dependencies.readSpaces(),
			this.dependencies.readActiveProjects(),
			sessionPath ? this.dependencies.readTeamSessionId(sessionPath) : Promise.resolve(undefined),
		]);
		return listSiblingProjects(parseSpaceSiblingMirror(spaces), activeProjects, { cwd, sessionPath, teamSessionId });
	}

	/** 沙箱 read 免确认的额外根目录。出错返回空，让调用方回到授权弹窗。 */
	async readRoots(sessionId: string): Promise<string[]> {
		try {
			return (await this.listForSession(sessionId)).map((project) => project.path);
		} catch (error) {
			this.dependencies.log?.warn("failed to resolve sibling project read roots", error);
			return [];
		}
	}

	/**
	 * 清单与当前分支上最近一次告知不同，就在本轮附一条模型可见、界面不显示的上下文。
	 * 系统提示词保持不变，前缀缓存不受影响。
	 */
	async decoratePrompt(sessionId: string, request: PromptRequest): Promise<PromptRequest> {
		const runtime = this.runtime;
		if (!runtime) return request;
		try {
			const current = await this.listForSession(sessionId);
			const told = this.readTold(runtime, sessionId);
			if (sameSiblingProjects(current, told)) return request;
			const record: SessionContextRecord = {
				type: SIBLING_PROJECTS_CONTEXT_TYPE,
				content: [{ type: "text", text: renderSiblingProjectsContext(current) }],
				modelVisible: true,
				display: false,
				metadata: { projects: current.map(({ name, path }) => ({ name, path })) },
			};
			return { ...request, context: [...(request.context ?? []), record] };
		} catch (error) {
			this.dependencies.log?.warn("failed to attach sibling project context", error);
			return request;
		}
	}

	private readTold(runtime: SiblingProjectsRuntimePort, sessionId: string): SiblingProject[] {
		try {
			return readToldSiblingProjects(runtime.readSessionDocument(sessionId));
		} catch {
			// 读不到文档时按「未告知」处理：最坏多告知一次，不会让 Agent 沿用过期清单。
			return [];
		}
	}
}
