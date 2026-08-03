import type { ExtensionRunner } from "../../core/extensions/runner.js";
import type { Extension, RegisteredTool } from "../../core/extensions/types.js";

/** Greenfield 事件桥与 Tool Runtime 实际需要的 Extension Runner 结构。 */
export type CodingAgentGreenfieldExtensionRunnerPort = Pick<
	ExtensionRunner,
	| "createContext"
	| "emitBeforeAgentStart"
	| "emitContext"
	| "emitInput"
	| "emitToolCall"
	| "emitToolResult"
	| "hasHandlers"
>;

/** 动态 Tool 刷新只读取 Extension 的注册工具集合。 */
export type CodingAgentGreenfieldExtensionToolSource = Pick<Extension, "tools">;

/** 产品宿主交给 Session Tool Overlay 的最小注册记录。 */
export type CodingAgentGreenfieldSessionToolRegistration = RegisteredTool;
