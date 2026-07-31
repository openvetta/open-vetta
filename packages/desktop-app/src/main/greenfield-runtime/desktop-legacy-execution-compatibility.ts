import type { ModelRegistry } from "@vetta/coding-agent/host-services";
import { LegacyCodingAgentSessionBackend } from "@vetta/coding-agent/runtime-host";
import type { RuntimeHostSessionBackend } from "../../../../runtime-core/src/index.js";

export interface DesktopLegacyExecutionCompatibilityOptions {
	readonly modelRegistry: ModelRegistry;
}

export interface DesktopLegacyExecutionCompatibility {
	readonly sessionBackend: RuntimeHostSessionBackend;
}

/** Desktop 显式 Legacy 回退与旧会话恢复所需的唯一执行兼容边界。 */
export function createDesktopLegacyExecutionCompatibility(
	options: DesktopLegacyExecutionCompatibilityOptions,
): DesktopLegacyExecutionCompatibility {
	return {
		sessionBackend: new LegacyCodingAgentSessionBackend(options.modelRegistry),
	};
}
