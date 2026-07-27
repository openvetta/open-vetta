import { type AgentSession, type CreateAgentSessionOptions, createAgentSession } from "@vetta/coding-agent";
import {
	createLegacyRuntimeSessionCorePorts,
	LegacyRuntimeSessionBackgroundWorkController,
	LegacyRuntimeSessionExecutionController,
	LegacyRuntimeSessionHistoryController,
	LegacyRuntimeSessionHistoryReader,
	LegacyRuntimeSessionHostInteraction,
	LegacyRuntimeSessionIdentityLifecycle,
	LegacyRuntimeSessionModelController,
	LegacyRuntimeSessionModelView,
	LegacyRuntimeSessionTodoController,
	LegacyRuntimeSessionWorkspaceView,
} from "./legacy-session-ports.js";
import type {
	RuntimeSessionBackgroundWorkController,
	RuntimeSessionCorePorts,
	RuntimeSessionExecutionController,
	RuntimeSessionHistoryController,
	RuntimeSessionHistoryReader,
	RuntimeSessionHostInteraction,
	RuntimeSessionIdentityLifecycle,
	RuntimeSessionModelController,
	RuntimeSessionModelView,
	RuntimeSessionTodoController,
	RuntimeSessionWorkspaceView,
} from "./session-ports.js";

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

export interface RuntimeHostSessionAssembly {
	readonly session: RuntimeSession;
	readonly lifecycle: RuntimeSessionIdentityLifecycle;
	readonly historyReader: RuntimeSessionHistoryReader;
	readonly historyController: RuntimeSessionHistoryController;
	readonly hostInteraction: RuntimeSessionHostInteraction;
	readonly executionController: RuntimeSessionExecutionController;
	readonly workspaceView: RuntimeSessionWorkspaceView;
	readonly backgroundWorkController: RuntimeSessionBackgroundWorkController;
	readonly todoController: RuntimeSessionTodoController;
	readonly modelController: RuntimeSessionModelController;
	readonly modelView: RuntimeSessionModelView;
	readonly corePorts: RuntimeSessionCorePorts;
}

/** RuntimeHost 的组合根合同：一次创建同时交付外围句柄与基础能力 Port。 */
export interface RuntimeHostSessionBackend {
	createAssembly(options: RuntimeSessionCreateOptions): Promise<RuntimeHostSessionAssembly>;
}

/** 将旧 create-only Backend 限制在兼容边界，RuntimeHost 不再自行判断 Session 实现。 */
export class RuntimeSessionBackendAssemblyAdapter implements RuntimeHostSessionBackend {
	constructor(private readonly backend: RuntimeSessionBackend) {}

	async createAssembly(options: RuntimeSessionCreateOptions): Promise<RuntimeHostSessionAssembly> {
		const session = await this.backend.create(options);
		return createLegacyRuntimeHostSessionAssembly(session);
	}
}

export function asRuntimeHostSessionBackend(
	backend: RuntimeSessionBackend | RuntimeHostSessionBackend,
): RuntimeHostSessionBackend {
	return isRuntimeHostSessionBackend(backend) ? backend : new RuntimeSessionBackendAssemblyAdapter(backend);
}

/** 保留现有生产行为的 coding-agent 兼容后端。 */
export class LegacyCodingAgentSessionBackend implements RuntimeSessionBackend, RuntimeHostSessionBackend {
	async create(options: RuntimeSessionCreateOptions): Promise<RuntimeSession> {
		const { session } = await createAgentSession(options);
		return session;
	}

	async createAssembly(options: RuntimeSessionCreateOptions): Promise<RuntimeHostSessionAssembly> {
		const session = await this.create(options);
		return createLegacyRuntimeHostSessionAssembly(session);
	}
}

export function createLegacyRuntimeHostSessionAssembly(session: RuntimeSession): RuntimeHostSessionAssembly {
	return {
		session,
		lifecycle: new LegacyRuntimeSessionIdentityLifecycle(session),
		historyReader: new LegacyRuntimeSessionHistoryReader(session),
		historyController: new LegacyRuntimeSessionHistoryController(session),
		hostInteraction: new LegacyRuntimeSessionHostInteraction(session),
		executionController: new LegacyRuntimeSessionExecutionController(session),
		workspaceView: new LegacyRuntimeSessionWorkspaceView(session),
		backgroundWorkController: new LegacyRuntimeSessionBackgroundWorkController(session),
		todoController: new LegacyRuntimeSessionTodoController(session),
		modelController: new LegacyRuntimeSessionModelController(session),
		modelView: new LegacyRuntimeSessionModelView(session),
		corePorts: createLegacyRuntimeSessionCorePorts(session),
	};
}

function isRuntimeHostSessionBackend(
	backend: RuntimeSessionBackend | RuntimeHostSessionBackend,
): backend is RuntimeHostSessionBackend {
	return "createAssembly" in backend && typeof backend.createAssembly === "function";
}
