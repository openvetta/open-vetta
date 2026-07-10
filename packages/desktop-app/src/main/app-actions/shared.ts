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
