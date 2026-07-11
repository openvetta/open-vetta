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

/** 实体不存在时抛出稳定错误；供 assertReady / run 复用。 */
export function assertEntityExists(condition: unknown, message: string, details?: JsonValue): asserts condition {
	if (!condition) {
		throw new ActionError("ACTION_NOT_FOUND", message, details);
	}
}

export interface AgentEntityNotFoundParams {
	/** 当前 operation，如 set-enabled / remove / update */
	operation: string;
	/** 实体类型（给 agent 读），如 "MCP server"、"scheduled task" */
	entity: string;
	/** agent 传入的字段名，如 name / id / taskId / modelKey */
	idField: string;
	/** agent 传入的错误值 */
	id: string;
	/** 下一步应调用的 query Action id */
	queryAction: string;
	/** 该 query 的示例 input */
	queryExample: JsonValue;
	/** query 结果里应复制的字段路径说明 */
	resultIdPath: string;
	/** 当前已知合法 id（可选，帮助 agent 立刻纠正） */
	availableIds?: readonly string[];
	/** message 中最多列出多少个 id */
	maxListed?: number;
	/** 额外说明 */
	extra?: string;
	errorCode?: string;
}

/**
 * 面向 Agent 的「实体不存在」错误：
 * - 说明审批未弹出（approvalShown=false）
 * - 指出错误字段与取值
 * - 给出应调用的 query 与如何取得合法 id
 * - details 可机读，供 agent 程序化处理
 */
export function throwAgentEntityNotFound(params: AgentEntityNotFoundParams): never {
	const maxListed = params.maxListed ?? 15;
	const all = params.availableIds ?? [];
	const listed = all.slice(0, maxListed);
	const availableText =
		listed.length === 0
			? `There are currently no known ${params.entity} values; the list from ${params.queryAction} may be empty.`
			: `Currently available ${params.idField} values (${listed.length}${all.length > maxListed ? ` of ${all.length}` : ""}): ${listed
					.map((value) => JSON.stringify(value))
					.join(", ")}${all.length > maxListed ? ", ..." : "."}`;

	const message = [
		`Refused operation "${params.operation}" before showing user approval because the target ${params.entity} does not exist.`,
		`Invalid ${params.idField}=${JSON.stringify(params.id)} (this value was provided by the agent, not the user).`,
		`Do not invent ids. Call ${params.queryAction} with input ${JSON.stringify(params.queryExample)}, then copy an exact ${params.idField} from ${params.resultIdPath} and retry.`,
		availableText,
		params.extra,
	]
		.filter(Boolean)
		.join(" ");

	throw new ActionError(params.errorCode ?? "ACTION_NOT_FOUND", message, {
		reason: "entity_not_found",
		approvalShown: false,
		operation: params.operation,
		entity: params.entity,
		idField: params.idField,
		id: params.id,
		queryAction: params.queryAction,
		queryExample: params.queryExample,
		resultIdPath: params.resultIdPath,
		availableIds: listed,
		availableCount: all.length,
		truncated: all.length > maxListed,
	});
}

/** 格式/参数错误时给 agent 的可操作说明。 */
export function throwAgentInvalidInput(message: string, details?: Record<string, JsonValue | undefined>): never {
	const payload: Record<string, JsonValue> = {
		reason: "invalid_input",
		approvalShown: false,
	};
	if (details) {
		for (const [key, value] of Object.entries(details)) {
			if (value !== undefined) payload[key] = value;
		}
	}
	throw new ActionError("ACTION_INVALID_INPUT", message, payload);
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
