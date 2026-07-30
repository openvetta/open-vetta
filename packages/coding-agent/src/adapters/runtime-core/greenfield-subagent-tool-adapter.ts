import type { SubagentCoordinatorPort } from "@vetta/runtime-subagents";
import { createSubagentControlTools } from "../../core/subagents/tools/index.js";
import {
	CODING_AGENT_MODEL_TOOL_ORDER,
	CODING_AGENT_SUBAGENT_MODEL_TOOL_ORDER_STEP,
} from "./greenfield-model-tool-order.js";
import {
	adaptCodingAgentToolRegistration,
	type CodingAgentRuntimeToolRegistration,
} from "./greenfield-tool-adapter.js";

/** 保留旧七个控制工具的名称、TypeBox Schema、描述和返回协议。 */
export function createCodingAgentSubagentRuntimeToolRegistrations(
	getCoordinator: () => SubagentCoordinatorPort | undefined,
): readonly CodingAgentRuntimeToolRegistration[] {
	const [spawn, dispatch, wait, list, interrupt, send, followUp] = createSubagentControlTools({
		getCoordinator,
	});
	const order = (index: number) => ({
		modelOrder: CODING_AGENT_MODEL_TOOL_ORDER.subagentStart + index * CODING_AGENT_SUBAGENT_MODEL_TOOL_ORDER_STEP,
	});
	return [
		adaptCodingAgentToolRegistration(spawn, order(0)),
		adaptCodingAgentToolRegistration(dispatch, order(1)),
		adaptCodingAgentToolRegistration(wait, order(2)),
		adaptCodingAgentToolRegistration(list, order(3)),
		adaptCodingAgentToolRegistration(interrupt, order(4)),
		adaptCodingAgentToolRegistration(send, order(5)),
		adaptCodingAgentToolRegistration(followUp, order(6)),
	];
}
