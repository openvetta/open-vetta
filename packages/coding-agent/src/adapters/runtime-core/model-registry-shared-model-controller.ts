import type { RuntimeSharedModelController } from "@vetta/runtime-core";
import type { ModelRegistry } from "../../core/model-registry.js";

/** 将 Coding Agent ModelRegistry 适配为 RuntimeHost 的进程级模型控制端口。 */
export class ModelRegistryRuntimeSharedModelController implements RuntimeSharedModelController {
	constructor(private readonly modelRegistry: ModelRegistry) {}

	async refreshAuth(token: string | undefined): Promise<void> {
		this.modelRegistry.setServerToken(token);
		await this.modelRegistry.loadRemoteModels();
	}

	refreshInBackground(): void {
		void this.modelRegistry.loadRemoteModels();
	}
}
