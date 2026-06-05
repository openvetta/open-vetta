import type { AppActionCatalog } from "./catalog.js";
import { type ActionApprovalRequester, type ActionContext, ActionError, type JsonValue } from "./types.js";

export class AppActionRuntime {
	constructor(
		private readonly catalog: AppActionCatalog,
		private readonly approvalRequester: ActionApprovalRequester,
	) {}

	search(options: { query?: string; domain?: string }): JsonValue {
		return this.catalog.search(options) as unknown as JsonValue;
	}

	describe(actionId: string): JsonValue {
		return this.catalog.describe(actionId) as unknown as JsonValue;
	}

	async run(actionId: string, input: unknown, context: ActionContext): Promise<JsonValue> {
		const action = this.catalog.get(actionId);
		const validatedInput = action.validateInput(input);
		if (action.requiresApproval?.(validatedInput, context)) {
			const approved = await this.approvalRequester.request(
				{
					actionId,
					input: validatedInput,
					title: action.title,
					summary: action.summary,
					permission: action.permission,
				},
				context.signal,
			);
			if (!approved) {
				throw new ActionError("ACTION_REJECTED", "用户拒绝执行该 Vetta action。", { actionId });
			}
		}
		return await action.run(validatedInput, context);
	}
}
