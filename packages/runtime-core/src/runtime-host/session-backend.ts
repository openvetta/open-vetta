import { type AgentSession, type CreateAgentSessionOptions, createAgentSession } from "@vetta/coding-agent";

/**
 * 当前生产会话在 RuntimeHost 内部使用的会话合同。
 *
 * 这一别名把旧 coding-agent 类型限制在兼容适配层；后续迁移会按事件、历史与
 * 外围能力逐步收窄合同，而不是一次性引入覆盖所有职责的巨型接口。
 */
export type RuntimeSession = AgentSession;

/** 当前兼容后端的创建参数；由 RuntimeHost 统一组装。 */
export type RuntimeSessionCreateOptions = CreateAgentSessionOptions;

/** RuntimeHost 创建会话时使用的可替换后端边界。 */
export interface RuntimeSessionBackend {
	create(options: RuntimeSessionCreateOptions): Promise<RuntimeSession>;
}

/** 保留现有生产行为的 coding-agent 兼容后端。 */
export class LegacyCodingAgentSessionBackend implements RuntimeSessionBackend {
	async create(options: RuntimeSessionCreateOptions): Promise<RuntimeSession> {
		const { session } = await createAgentSession(options);
		return session;
	}
}
