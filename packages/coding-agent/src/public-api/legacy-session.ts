/** Explicit compatibility surface for the Legacy AgentSession implementation. */
export {
	AgentSession,
	type AgentSessionConfig,
	type AgentSessionEvent,
	type AgentSessionEventListener,
	type ModelCycleResult,
	type ParsedSkillBlock,
	type PromptOptions,
	type PromptResourceRef,
	parseSkillBlock,
	type SessionStats,
} from "../core/agent-session.js";
export {
	type SessionContext,
	type SessionEntry,
	type SessionInfo,
	SessionManager,
} from "../core/session-manager/index.js";
