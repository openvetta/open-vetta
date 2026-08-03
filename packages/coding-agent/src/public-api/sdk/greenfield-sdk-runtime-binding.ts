import type { GreenfieldRuntimeSession } from "@vetta/runtime-core";
import type { GreenfieldSdkSessionCapabilityPort, GreenfieldSdkSessionRuntimePort } from "./sdk-session-contract.js";

/** 唯一允许感知 GreenfieldRuntimeSession 具体表面的 SDK 组合边界。 */
export function bindGreenfieldSdkSessionRuntime(
	session: GreenfieldRuntimeSession,
	capabilities: GreenfieldSdkSessionCapabilityPort,
): GreenfieldSdkSessionRuntimePort {
	const assembly = session.createCoreAssembly();
	return {
		capabilities,
		get sessionId() {
			return assembly.lifecycle.sessionId;
		},
		get sessionPath() {
			return assembly.lifecycle.sessionPath;
		},
		prompt: (request) => capabilities.prompt(request),
		abort: (reason) => session.abort(reason),
		readState: () => session.readState(),
		readMessages: () => session.readMessages(),
		selectModel: async (modelKey) => {
			const separator = modelKey.indexOf("/");
			if (separator < 0) return;
			await capabilities.selectModel(modelKey.slice(0, separator), modelKey.slice(separator + 1));
		},
		setThinkingLevel: (level) => capabilities.setThinkingLevel(level),
		subscribeExecutionObservation: (handler) => assembly.executionObservationStream.subscribe(handler),
		dispose: () => session.dispose(),
	};
}
