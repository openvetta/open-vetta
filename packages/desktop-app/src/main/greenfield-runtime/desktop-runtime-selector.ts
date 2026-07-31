export type DesktopAgentRuntimeBackend = "legacy" | "greenfield";

export const DESKTOP_AGENT_RUNTIME_ENV = "VETTA_DESKTOP_AGENT_RUNTIME";

/** Desktop Runtime 在进程启动时确定；缺省使用 Greenfield，显式 legacy 可回退。 */
export function resolveDesktopAgentRuntimeBackend(value: string | undefined): DesktopAgentRuntimeBackend {
	if (value === undefined || value.trim() === "") return "greenfield";
	if (value === "legacy") return value;
	if (value === "greenfield") return value;
	throw new Error(`${DESKTOP_AGENT_RUNTIME_ENV} must be "legacy" or "greenfield", received "${value}"`);
}
