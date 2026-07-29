export type DesktopAgentRuntimeBackend = "legacy" | "greenfield";

export const DESKTOP_AGENT_RUNTIME_ENV = "VETTA_DESKTOP_AGENT_RUNTIME";

/** Desktop Runtime 在进程启动时确定；缺省继续使用 Legacy。 */
export function resolveDesktopAgentRuntimeBackend(value: string | undefined): DesktopAgentRuntimeBackend {
	if (value === undefined || value.trim() === "" || value === "legacy") return "legacy";
	if (value === "greenfield") return value;
	throw new Error(`${DESKTOP_AGENT_RUNTIME_ENV} must be "legacy" or "greenfield", received "${value}"`);
}
