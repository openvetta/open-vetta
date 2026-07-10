import { z } from "zod";
import { getAppLogger } from "../logger.js";
import { type ActionApprovalMetadata, ActionError, type JsonValue } from "./types.js";

const log = getAppLogger("action-shared");

export const genericApprovalUiSchema = z.literal("generic").optional().default("generic");

export const genericApproval: ActionApprovalMetadata = {
	defaultPresentation: "generic",
	presentations: [
		{
			id: "generic",
			title: "通用确认",
			description: "使用通用 Action 审批界面，直接展示 Action 信息和完整输入。",
		},
	],
};

export interface OperationApprovalPresentation {
	id: string;
	title: string;
	description: string;
}

/**
 * 按 operation 配置审批 presentation（对齐 scheduler）。
 * schema 中每种 operation 应 default 到对应 presentation；generic 仅兜底。
 */
export function createOperationApprovals(
	defaultPresentation: string,
	presentations: OperationApprovalPresentation[],
): ActionApprovalMetadata {
	if (!presentations.some((item) => item.id === defaultPresentation)) {
		throw new ActionError(
			"ACTION_APPROVAL_CONFIG_INVALID",
			`defaultPresentation is not declared: ${defaultPresentation}`,
		);
	}
	return {
		defaultPresentation,
		presentations: [
			...presentations,
			{
				id: "generic",
				title: "通用确认",
				description: "使用通用 Action 审批界面，直接展示 Action 信息和完整输入。",
			},
		],
	};
}

/** 单个 operation 的 approvalUi：默认指向专用 presentation，可回退 generic。 */
export function operationApprovalUiSchema<T extends string>(presentation: T) {
	return z
		.union([z.literal(presentation), z.literal("generic")])
		.optional()
		.default(presentation);
}

/** @deprecated 使用 createOperationApprovals；保留仅避免遗漏引用时编译失败。 */
export function createDomainManageApproval(
	domain: string,
	title: string,
	description?: string,
): ActionApprovalMetadata {
	const presentation = `${domain}.manage`;
	return createOperationApprovals(presentation, [
		{
			id: presentation,
			title,
			description: description ?? `使用「${title}」专用审批界面展示操作详情与关键字段。`,
		},
	]);
}

/** @deprecated 使用 operationApprovalUiSchema */
export function manageApprovalUiSchema<T extends string>(presentation: T) {
	return operationApprovalUiSchema(presentation);
}

export function toJsonValue(value: unknown): JsonValue {
	try {
		return JSON.parse(JSON.stringify(value)) as JsonValue;
	} catch (error) {
		log.error("toJsonValue: failed to serialize value", error);
		throw new ActionError("ACTION_SERIALIZE_ERROR", "Failed to serialize action result as JSON.");
	}
}

export function validateActionInput<T>(schema: z.ZodType<T>, input: unknown, actionId: string): JsonValue {
	const result = schema.safeParse(input);
	if (!result.success) {
		throw new ActionError("ACTION_INVALID_INPUT", `Input must match the ${actionId} schema.`, {
			issues: result.error.issues.map((issue) => ({
				path: issue.path.map(String).join("."),
				message: issue.message,
			})),
		});
	}
	return result.data as JsonValue;
}

export function maskSecret(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	if (value.length === 0) return "";
	return "***";
}

export function redactRecordSecrets(
	record: Record<string, string> | undefined,
	secretKeys: readonly string[] = ["authorization", "api-key", "apikey", "x-api-key", "token"],
): Record<string, string> | undefined {
	if (!record) return undefined;
	const next: Record<string, string> = {};
	for (const [key, value] of Object.entries(record)) {
		const lower = key.toLowerCase();
		next[key] = secretKeys.some((secretKey) => lower.includes(secretKey)) ? "***" : value;
	}
	return next;
}

export async function runActionService<T>(
	operation: () => Promise<T> | T,
	mapError?: (error: unknown) => ActionError | undefined,
): Promise<JsonValue> {
	try {
		return toJsonValue(await operation());
	} catch (error) {
		const mapped = mapError?.(error);
		if (mapped) throw mapped;
		if (error instanceof ActionError) throw error;
		if (error instanceof Error) {
			throw new ActionError("ACTION_FAILED", error.message);
		}
		throw new ActionError("ACTION_FAILED", "Unknown action failure");
	}
}
