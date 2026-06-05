import type { AppActionCatalog } from "./catalog.js";
import {
	type ActionApprovalMetadata,
	type ActionApprovalRequester,
	type ActionContext,
	ActionError,
	type JsonValue,
} from "./types.js";

const APPROVAL_UI_INPUT_KEY = "approvalUi";

function resolveApprovalPresentation(input: JsonValue, approval: ActionApprovalMetadata | undefined): string {
	if (!approval) {
		throw new ActionError(
			"ACTION_APPROVAL_CONFIG_INVALID",
			"Action requires approval but has no approval UI configured.",
		);
	}

	const requested =
		typeof input === "object" &&
		input !== null &&
		!Array.isArray(input) &&
		typeof input[APPROVAL_UI_INPUT_KEY] === "string"
			? input[APPROVAL_UI_INPUT_KEY]
			: undefined;
	const presentation = requested ?? approval.defaultPresentation;
	if (!approval.presentations.some((candidate) => candidate.id === presentation)) {
		throw new ActionError("ACTION_INVALID_INPUT", `Unsupported approval UI: ${presentation}`, {
			path: APPROVAL_UI_INPUT_KEY,
			allowed: approval.presentations.map((candidate) => candidate.id),
		});
	}
	return presentation;
}

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
			const approvalPresentation = resolveApprovalPresentation(validatedInput, action.approval);
			const approved = await this.approvalRequester.request(
				{
					actionId,
					approvalPresentation,
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
