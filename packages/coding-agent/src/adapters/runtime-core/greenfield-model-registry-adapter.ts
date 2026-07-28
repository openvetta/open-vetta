import type { Api, Model } from "@vetta/ai";
import type { RuntimeModelCatalog, RuntimeModelCredentialResolver } from "@vetta/runtime-core";

export interface CodingAgentModelRegistrySource {
	refresh(): void;
	getAvailable(): readonly Model<Api>[];
	find(provider: string, modelId: string): Model<Api> | undefined;
	getApiKey(model: Model<Api>): Promise<string | undefined>;
	setServerToken(token: string | undefined): void;
	loadRemoteModels(): Promise<"unauthorized" | undefined>;
}

/** 将 Coding Agent ModelRegistry 适配为 Greenfield 的目录与凭证 Port。 */
export class CodingAgentModelRegistryAdapter implements RuntimeModelCatalog, RuntimeModelCredentialResolver {
	constructor(private readonly registry: CodingAgentModelRegistrySource) {}

	refresh(): void {
		this.registry.refresh();
	}

	listAvailable(): readonly Model<Api>[] {
		return [...this.registry.getAvailable()];
	}

	find(provider: string, modelId: string): Model<Api> | undefined {
		return this.registry.find(provider, modelId);
	}

	resolve(model: Model<Api>): Promise<string | undefined> {
		return this.registry.getApiKey(model);
	}

	async refreshAuth(token: string | undefined): Promise<void> {
		this.registry.setServerToken(token);
		await this.registry.loadRemoteModels();
	}
}
