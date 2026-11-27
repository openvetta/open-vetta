import type { ConversationDocument, PromptRequest } from "@vetta/runtime-core";
import type { SessionContextRecord } from "@vetta/runtime-core/kernel";
import {
	EMPTY_SPACE_SIBLING_MIRROR,
	listSiblingProjects,
	type ProjectRegistryEntry,
	parseSpaceSiblingMirror,
	readToldSiblingProjects,
	renderSiblingProjectsContext,
	SIBLING_PROJECTS_CONTEXT_TYPE,
	type SiblingProject,
	type SpaceSiblingMirror,
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
	readonly loadMirror: () => Promise<unknown>;
	readonly saveMirror: (mirror: SpaceSiblingMirror) => Promise<void>;
	readonly log?: SiblingProjectsLogger;
}

/**
 * 同空间兄弟项目的主进程侧（ADR-0159）。
 *
 * - 持有 Renderer 推来的空间归属镜像，并落盘，让手机、自动化等不经窗口的轮次冷启动后也能算；
 * - 沙箱在 read 越界时实时询问 {@link readRoots}；
 * - 每轮 prompt 前 {@link decoratePrompt} 按变化追加一条只给模型看的上下文。
 *
 * 任何失败都不能拖垮对话：读放行失败回到授权弹窗，装饰失败原样发出 prompt。
 */
export class SiblingProjectsService {
	private mirror: SpaceSiblingMirror = EMPTY_SPACE_SIBLING_MIRROR;
	private loaded: Promise<void> | undefined;
	private receivedFromRenderer = false;
	private saveTail: Promise<void> = Promise.resolve();
	private runtime: SiblingProjectsRuntimePort | undefined;

	constructor(private readonly dependencies: SiblingProjectsServiceDependencies) {}

	attachRuntime(runtime: SiblingProjectsRuntimePort): void {
		this.runtime = runtime;
	}

	/** Renderer 推来新的归属镜像：立即生效，再串行落盘。 */
	updateMirror(raw: unknown): Promise<void> {
		const mirror = parseSpaceSiblingMirror(raw);
		this.mirror = mirror;
		this.receivedFromRenderer = true;
		const save = this.saveTail.then(() =>
			this.dependencies.saveMirror(mirror).catch((error: unknown) => {
				this.dependencies.log?.warn("failed to persist space sibling mirror", error);
			}),
		);
		this.saveTail = save;
		return save;
	}

	/** 当前镜像（测试与诊断用）。 */
	async readMirror(): Promise<SpaceSiblingMirror> {
		await this.ensureLoaded();
		return this.mirror;
	}

	/** 会话当前可见的兄弟项目，按侧栏顺序。 */
	async listForSession(sessionId: string): Promise<SiblingProject[]> {
		const runtime = this.runtime;
		if (!runtime || !sessionId) return [];
		await this.ensureLoaded();
		const cwd = runtime.readSessionWorkingDirectory(sessionId);
		const sessionPath = runtime.getSessionPath(sessionId);
		const [activeProjects, teamSessionId] = await Promise.all([
			this.dependencies.readActiveProjects(),
			sessionPath ? this.dependencies.readTeamSessionId(sessionPath) : Promise.resolve(undefined),
		]);
		return listSiblingProjects(this.mirror, activeProjects, { cwd, sessionPath, teamSessionId });
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

	private ensureLoaded(): Promise<void> {
		this.loaded ??= this.dependencies
			.loadMirror()
			.then((raw) => {
				// Renderer 已经推过新镜像时，磁盘上的旧副本不能把它盖回去。
				if (!this.receivedFromRenderer) this.mirror = parseSpaceSiblingMirror(raw);
			})
			.catch((error: unknown) => {
				this.dependencies.log?.warn("failed to load space sibling mirror", error);
			});
		return this.loaded;
	}
}
