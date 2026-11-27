import {
	type PromptRequest,
	RuntimeHost,
	type RuntimeHostOptions,
	type RuntimeQueuePromptIfRunningOutcome,
	type RuntimeTurnPromptOutcome,
} from "@vetta/runtime-core";

/** 在 prompt 进入 RuntimeHost 前补充产品侧上下文；实现不得抛错，失败时原样返回。 */
export type DesktopPromptRequestDecorator = (sessionId: string, request: PromptRequest) => Promise<PromptRequest>;

/**
 * 桌面进程的 RuntimeHost。
 *
 * 窗口、手机远程、自动化、Team 成员的轮次都经同一个实例的这几个入口进入，所以产品侧
 * 每轮上下文（如同空间兄弟项目，ADR-0159）在这里统一补，而不是散落到每个调用方。
 */
export interface DesktopRuntimeHostOptions extends RuntimeHostOptions {
	readonly decoratePromptRequest: DesktopPromptRequestDecorator;
}

export class DesktopRuntimeHost extends RuntimeHost {
	private readonly decoratePromptRequest: DesktopPromptRequestDecorator;

	constructor({ decoratePromptRequest, ...options }: DesktopRuntimeHostOptions) {
		super(options);
		this.decoratePromptRequest = decoratePromptRequest;
	}

	override async prompt(sessionId: string, request: PromptRequest): Promise<RuntimeTurnPromptOutcome> {
		return super.prompt(sessionId, await this.decorate(sessionId, request));
	}

	override async promptWhenAvailable(
		sessionId: string,
		request: PromptRequest,
		signal?: AbortSignal,
	): Promise<RuntimeTurnPromptOutcome> {
		return super.promptWhenAvailable(sessionId, await this.decorate(sessionId, request), signal);
	}

	override async queuePromptIfRunning(
		sessionId: string,
		request: PromptRequest,
	): Promise<RuntimeQueuePromptIfRunningOutcome> {
		return super.queuePromptIfRunning(sessionId, await this.decorate(sessionId, request));
	}

	private async decorate(sessionId: string, request: PromptRequest): Promise<PromptRequest> {
		try {
			return await this.decoratePromptRequest(sessionId, request);
		} catch {
			return request;
		}
	}
}
