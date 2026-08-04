/** Stable contracts exposed to Coding Agent extensions and their hosts. */

export * from "./contracts.js";
export {
	bindExtensionRuntimeActions,
	type ExtensionExecutionHost,
} from "./runtime-bindings.js";
