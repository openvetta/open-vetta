import type { TSchema } from "@sinclair/typebox";
import type { AgentTool } from "@vetta/agent-core";
import type { ConversationScenario } from "@vetta/runtime-core";

/** @deprecated 仅供尚未退役的旧 Core Tool 源码使用；`any` 保留其历史默认泛型行为。 */
export type CodingAgentTool<TParameters extends TSchema = TSchema, TDetails = any> = AgentTool<
	TParameters,
	TDetails,
	ConversationScenario
>;

export type { ConversationScenario } from "@vetta/runtime-core";
export {
	ALL_SCENARIOS,
	DEFAULT_SCENARIO,
	type ToolActivationMetadata,
	type ToolCapability,
	type ToolCategory,
} from "../../profiles/contracts.js";
export { resolveActiveToolNames } from "../../profiles/tool-activation.js";
