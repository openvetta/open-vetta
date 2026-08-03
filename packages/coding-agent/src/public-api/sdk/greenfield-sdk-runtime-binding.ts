import type { GreenfieldRuntimeSession } from "@vetta/runtime-core";
import type { GreenfieldSdkSessionRuntimePort } from "./sdk-session-contract.js";

/** 唯一允许感知 GreenfieldRuntimeSession 具体表面的 SDK 组合边界。 */
export function bindGreenfieldSdkSessionRuntime(session: GreenfieldRuntimeSession): GreenfieldSdkSessionRuntimePort {
	const assembly = session.createCoreAssembly();
	return {
		get sessionId() {
			return assembly.lifecycle.sessionId;
		},
		get sessionPath() {
			return assembly.lifecycle.sessionPath;
		},
		prompt: (request) => session.prompt(request),
		abort: (reason) => session.abort(reason),
		readState: () => session.readState(),
		readMessages: () => session.readMessages(),
		selectModel: (modelKey) => assembly.modelController.selectModel(modelKey, "always"),
		setThinkingLevel: (level) => assembly.modelController.setThinkingLevel(level),
		subscribeExecutionObservation: (handler) => assembly.executionObservationStream.subscribe(handler),
		dispose: () => session.dispose(),
	};
}
