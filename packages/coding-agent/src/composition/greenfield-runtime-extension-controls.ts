import type {
	CodingAgentGreenfieldExtensionRunnerPort,
	CodingAgentGreenfieldExtensionToolSource,
} from "../adapters/runtime-core/greenfield-extension-contract.js";
import type { GreenfieldRuntimeExtensionControls } from "./greenfield-runtime-composition-contract.js";
import type { GreenfieldSessionResourceIndexes } from "./greenfield-session-resource-lifecycle-assembly.js";

export interface GreenfieldExtensionToolHostPort {
	bindRunner(
		sessionId: string,
		runner: CodingAgentGreenfieldExtensionRunnerPort,
		options?: { readonly replaceExisting?: boolean },
	): () => void;
	refresh(extensions: readonly CodingAgentGreenfieldExtensionToolSource[]): void;
}

export interface GreenfieldRuntimeExtensionControlsOptions {
	readonly indexes: Pick<GreenfieldSessionResourceIndexes, "extensionEventBridges">;
	readonly extensionToolRuntime?: GreenfieldExtensionToolHostPort;
}

/** 将宿主 Extension 调用投影到 Session Event Bridge 与进程级 Tool Runtime。 */
export function createGreenfieldRuntimeExtensionControls(
	options: GreenfieldRuntimeExtensionControlsOptions,
): GreenfieldRuntimeExtensionControls {
	return {
		bindExtensionRunner(sessionId, runner, bindingOptions) {
			const bridge = options.indexes.extensionEventBridges.get(sessionId);
			if (!bridge) throw new Error(`Greenfield Extension event bridge not found: ${sessionId}`);
			const unbindEvents = bridge.bind(runner, bindingOptions);
			const unbindTools = options.extensionToolRuntime?.bindRunner(sessionId, runner, bindingOptions);
			return {
				readSystemPrompt: () => bridge.readSystemPrompt(),
				dispose() {
					unbindTools?.();
					unbindEvents();
				},
			};
		},
		refreshExtensionTools(extensions) {
			options.extensionToolRuntime?.refresh(extensions);
		},
	};
}
