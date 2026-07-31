import { DESKTOP_AGENT_RUNTIME_ENV, resolveDesktopAgentRuntimeDecision } from "./desktop-runtime-selector.js";

/**
 * Desktop 进程级 Runtime 决策。RuntimeHost、Knowledge 等消费者共享同一个不可变结果，
 * 运行期间修改环境变量不会让不同消费者切到不同后端。
 */
export const desktopAgentRuntimeDecision = resolveDesktopAgentRuntimeDecision(process.env[DESKTOP_AGENT_RUNTIME_ENV]);
