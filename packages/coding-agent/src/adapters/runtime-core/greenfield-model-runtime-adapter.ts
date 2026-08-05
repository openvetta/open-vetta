import type { Api, Model } from "@vetta/ai";
import type { RuntimeModelCatalog, RuntimeModelCredentialResolver } from "@vetta/runtime-core";

export interface CodingAgentRuntimeModelSource {
	refresh(): void;
	getAvailable(): readonly Model<Api>[];
	find(provider: string, modelId: string): Model<Api> | undefined;
	getApiKey(model: Model<Api>): Promise<string | undefined>;
	setServerToken(token: string | undefined): void;
	loadRemoteModels(): Promise<"unauthorized" | undefined>;
}

export class CodingAgentRuntimeModelAdapter implements RuntimeModelCatalog, RuntimeModelCredentialResolver {
	constructor(private readonly models: CodingAgentRuntimeModelSource) {}

	refresh(): void {
		this.models.refresh();
	}

	listAvailable(): readonly Model<Api>[] {
		return [...this.models.getAvailable()];
	}

	find(provider: string, modelId: string): Model<Api> | undefined {
		return this.models.find(provider, modelId);
	}

	resolve(model: Model<Api>): Promise<string | undefined> {
		return this.models.getApiKey(model);
	}

	async refreshAuth(token: string | undefined): Promise<void> {
		this.models.setServerToken(token);
		await this.models.loadRemoteModels();
	}
}
