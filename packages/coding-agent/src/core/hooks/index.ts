export {
	type BuildDefaultHookConfigLayersOptions,
	buildDefaultHookConfigLayers,
	createEcosystemHookRuntime,
	type EcosystemHookAdapter,
	type EcosystemHookAdapterFactory,
	type EcosystemHookEvent,
	type EcosystemHookHost,
	EcosystemHookRuntime,
	emptyHookDispatchOutcome,
	type HookConfigLayer,
	type HookDispatchOutcome,
} from "@vetta/ecosystem-adapter";
export { type EcosystemHookAwareTool, wrapToolsWithEcosystemHooks } from "./tool-wrapper.js";
