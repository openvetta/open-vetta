/**
 * RuntimeHost 模块入口。
 *
 * 目录职责：
 * - runtime-host.ts      会话生命周期与编排（SessionFacade）
 * - session-events.ts    旧事件 → Session Observation → SessionEvent 映射
 * - greenfield-session-events.ts  KernelEvent → SessionEvent 映射
 * - history.ts           会话历史 / 分支 / turn timing 解析
 * - peripheral-tasks.ts  自动标题、输入预测（轻量 LLM + 失败轮转）
 * - plugin-debug.ts      插件调试日志
 * - types.ts             共享类型
 */

export {
	type GreenfieldPreparedPrompt,
	type GreenfieldPromptAdapter,
	type GreenfieldPromptPreparationContext,
	type GreenfieldRuntimeAssembly,
	type GreenfieldRuntimeFactory,
	GreenfieldRuntimeSession,
	GreenfieldRuntimeSessionBackend,
	type GreenfieldRuntimeSessionBackendOptions,
	type GreenfieldRuntimeSessionState,
} from "./greenfield-session-backend.js";
export { mapGreenfieldKernelEventToSessionEvents } from "./greenfield-session-events.js";
export {
	createLegacyRuntimeSessionCorePorts,
	LegacyRuntimeSessionEventStream,
	LegacyRuntimeSessionHistoryController,
	LegacyRuntimeSessionHistoryReader,
	LegacyRuntimeSessionIdentityLifecycle,
	LegacyRuntimeSessionModelController,
	LegacyRuntimeSessionStateReader,
	LegacyRuntimeSessionTurnControl,
} from "./legacy-session-ports.js";
export { RuntimeHost } from "./runtime-host.js";
export type {
	RuntimeHostSessionAssembly,
	RuntimeHostSessionBackend,
	RuntimeSession,
	RuntimeSessionBackend,
	RuntimeSessionCreateOptions,
} from "./session-backend.js";
export {
	asRuntimeHostSessionBackend,
	createLegacyRuntimeHostSessionAssembly,
	LegacyCodingAgentSessionBackend,
	RuntimeSessionBackendAssemblyAdapter,
} from "./session-backend.js";
export { mapRuntimeSessionObservationEvent } from "./session-events.js";
export type {
	RuntimeModelSelectionStrategy,
	RuntimeSessionCorePorts,
	RuntimeSessionEventStream,
	RuntimeSessionHistoryController,
	RuntimeSessionHistoryReader,
	RuntimeSessionIdentityLifecycle,
	RuntimeSessionModelController,
	RuntimeSessionState,
	RuntimeSessionStateReader,
	RuntimeSessionTurnControl,
	RuntimeTurnPrompt,
} from "./session-ports.js";
export type { RunningChangedReason, RuntimeHostOptions } from "./types.js";
