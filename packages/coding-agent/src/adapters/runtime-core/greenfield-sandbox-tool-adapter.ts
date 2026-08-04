import type { RuntimeSessionHostInteractionContext } from "@vetta/runtime-core";
import type { CodingToolRegistration, ForegroundCommandOperations } from "@vetta/runtime-tools/coding";
import {
	createCodingAgentEditPathPolicy,
	createCodingAgentForegroundCommandHost,
	createCodingAgentWritePathPolicy,
} from "../runtime-tools/index.js";
import { buildSandboxToolRegistrations } from "./execution-mode/sandbox-tools.js";

export interface CodingAgentGreenfieldSandboxToolsOptions {
	readonly cwd: string;
	readonly hostInteraction: RuntimeSessionHostInteractionContext;
	readonly platform?: NodeJS.Platform;
	readonly windowsSandboxHostPath?: string;
	readonly linuxBubblewrapPath?: string;
	readonly macosSandboxExecPath?: string;
	readonly getSessionId?: () => string | undefined;
	/** Narrow platform-command port used by contract tests and alternate hosts. */
	readonly commandOperations?: ForegroundCommandOperations;
}

/** 组装 Runtime 原生工具合同与宿主提供的 OS sandbox 命令操作。 */
export function createCodingAgentGreenfieldSandboxToolRegistrations(
	options: CodingAgentGreenfieldSandboxToolsOptions,
): readonly CodingToolRegistration[] {
	const commandHost = createCodingAgentForegroundCommandHost(options.cwd);
	return (
		buildSandboxToolRegistrations({
			...options,
			editPathPolicy: createCodingAgentEditPathPolicy(options.cwd),
			writePathPolicy: createCodingAgentWritePathPolicy(options.cwd),
			commandEnvironment: commandHost.environment,
			protectedDirectories: commandHost.protectedDirectories,
		}) ?? []
	);
}
