import type { SubagentCoordinatorPort } from "@vetta/runtime-subagents";
import { createSubagentControlTools } from "../../core/subagents/tools/index.js";
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
	return [
		adaptCodingAgentToolRegistration(spawn),
		adaptCodingAgentToolRegistration(dispatch),
		adaptCodingAgentToolRegistration(wait),
		adaptCodingAgentToolRegistration(list),
		adaptCodingAgentToolRegistration(interrupt),
		adaptCodingAgentToolRegistration(send),
		adaptCodingAgentToolRegistration(followUp),
	];
}
