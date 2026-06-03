import type { AppActionCatalog } from "./catalog.js";
import type { ActionContext, JsonValue } from "./types.js";

export class AppActionRuntime {
	constructor(private readonly catalog: AppActionCatalog) {}

	search(options: { query?: string; domain?: string }): JsonValue {
		return this.catalog.search(options) as unknown as JsonValue;
	}

	describe(actionId: string): JsonValue {
		return this.catalog.describe(actionId) as unknown as JsonValue;
	}

	async run(actionId: string, input: unknown, context: ActionContext): Promise<JsonValue> {
		const action = this.catalog.get(actionId);
		const validatedInput = action.validateInput(input);
		return await action.run(validatedInput, context);
	}
}
