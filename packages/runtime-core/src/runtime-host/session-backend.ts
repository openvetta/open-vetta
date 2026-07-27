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

/**
 * 会话创建后端的通用工厂边界。
 *
 * 裸类型参数继续表示现有 RuntimeHost 使用的旧会话；Greenfield 组合根可显式
 * 指定自己的创建参数和会话门面，不需要伪装成 coding-agent AgentSession。
 */
export interface RuntimeSessionBackend<TCreateOptions = RuntimeSessionCreateOptions, TSession = RuntimeSession> {
	create(options: TCreateOptions): Promise<TSession>;
}

/** 保留现有生产行为的 coding-agent 兼容后端。 */
export class LegacyCodingAgentSessionBackend implements RuntimeSessionBackend {
	async create(options: RuntimeSessionCreateOptions): Promise<RuntimeSession> {
		const { session } = await createAgentSession(options);
		return session;
	}
}
