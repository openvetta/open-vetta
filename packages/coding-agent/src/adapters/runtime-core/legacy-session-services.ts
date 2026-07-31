import { ModelRegistryRuntimeSharedModelController } from "./model-registry-shared-model-controller.js";

export {
	LegacyRuntimeSessionCatalog,
	LegacyRuntimeSessionFileHistoryReader,
} from "./legacy-session-format/index.js";

/** @deprecated 请使用 ModelRegistryRuntimeSharedModelController。 */
export class LegacyRuntimeSharedModelController extends ModelRegistryRuntimeSharedModelController {}
