import { getAppLogger } from "../logger.js";
import type { AppActionCatalog } from "./catalog.js";
import {
	type ActionApprovalMetadata,
	type ActionApprovalRequester,
	type ActionContext,
	ActionError,
	type JsonValue,
} from "./types.js";

const APPROVAL_UI_INPUT_KEY = "approvalUi";
const log = getAppLogger("action-runtime");

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
		const startedAt = Date.now();
		const baseMeta = {
			actionId,
			source: context.source,
			requestId: context.requestId,
		};
		log.info("run: start", baseMeta);
		try {
			const action = this.catalog.get(actionId);
			let validatedInput = action.validateInput(input);
			const actionMeta = {
				...baseMeta,
				domain: action.domain,
				permission: action.permission,
			};
			log.info("run: input validated", actionMeta, { input: validatedInput });
			let approvalRequired = false;
			if (action.requiresApproval?.(validatedInput, context)) {
				approvalRequired = true;
				const approvalPresentation = resolveApprovalPresentation(validatedInput, action.approval);
				log.info("run: approval requested", actionMeta, { approvalPresentation });
				const approvalStartedAt = Date.now();
				const decision = await this.approvalRequester.request(
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
				const approvalDurationMs = Date.now() - approvalStartedAt;
				log.info("run: approval decided", actionMeta, {
					approved: decision.approved,
					inputChanged: decision.input !== undefined,
					durationMs: approvalDurationMs,
				});
				if (!decision.approved) {
					return {
						status: "rejected",
						actionId,
						actionTitle: action.title,
						message: `用户拒绝 action "${action.title}"（${actionId}）。授权弹窗已正常展示，但用户主动点击了"拒绝"按钮。请直接接受用户的决定，不要再尝试发起同一 action，询问用户接下来该怎么做`,
					};
				}
				if (decision.input !== undefined) {
					validatedInput = action.validateInput(decision.input);
					log.info("run: approval input validated", actionMeta, { input: validatedInput });
				}
			}
			const result = await action.run(validatedInput, context);
			log.info("run: success", actionMeta, { approvalRequired, durationMs: Date.now() - startedAt });
			return result;
		} catch (error) {
			log.error("run: failed", baseMeta, { durationMs: Date.now() - startedAt }, error);
			throw error;
		}
	}
}
