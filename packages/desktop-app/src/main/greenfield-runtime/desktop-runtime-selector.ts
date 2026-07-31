export type DesktopAgentRuntimeBackend = "legacy" | "greenfield";
export type DesktopAgentRuntimeRequest = "default" | DesktopAgentRuntimeBackend;

export interface DesktopAgentRuntimeDecision {
	readonly requestedBackend: DesktopAgentRuntimeRequest;
	readonly effectiveBackend: DesktopAgentRuntimeBackend;
	readonly source: "default" | "environment";
}

export const DESKTOP_AGENT_RUNTIME_ENV = "VETTA_DESKTOP_AGENT_RUNTIME";

/** Desktop Runtime 在进程启动时确定；缺省使用 Greenfield，显式 legacy 可回退。 */
export function resolveDesktopAgentRuntimeBackend(value: string | undefined): DesktopAgentRuntimeBackend {
	return resolveDesktopAgentRuntimeDecision(value).effectiveBackend;
}

export function resolveDesktopAgentRuntimeDecision(value: string | undefined): DesktopAgentRuntimeDecision {
	if (value === undefined || value.trim() === "") {
		return {
			requestedBackend: "default",
			effectiveBackend: "greenfield",
			source: "default",
		};
	}
	if (value === "legacy" || value === "greenfield") {
		return {
			requestedBackend: value,
			effectiveBackend: value,
			source: "environment",
		};
	}
	throw new Error(`${DESKTOP_AGENT_RUNTIME_ENV} must be "legacy" or "greenfield", received "${value}"`);
}
