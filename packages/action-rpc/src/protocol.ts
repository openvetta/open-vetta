import { ActionRpcError } from "./errors.js";
import type { ActionRpcRequest } from "./types.js";

function asRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new ActionRpcError("INVALID_REQUEST", "Request must be a JSON object");
	}
	return value as Record<string, unknown>;
}

function requireId(record: Record<string, unknown>): string {
	if (typeof record.id !== "string" || record.id.length === 0) {
		throw new ActionRpcError("INVALID_REQUEST", "Request id is required");
	}
	return record.id;
}

export function parseActionRpcRequest(value: unknown): ActionRpcRequest {
	const record = asRecord(value);
	const id = requireId(record);
	const method = record.method;
	if (method !== "actions.search" && method !== "actions.describe" && method !== "actions.run") {
		throw new ActionRpcError("INVALID_REQUEST", "Unsupported request method", {
			method: typeof method === "string" ? method : "unknown",
		});
	}

	const params = record.params === undefined ? undefined : asRecord(record.params);
	if (method === "actions.search") {
		return {
			id,
			method,
			params: {
				query: typeof params?.query === "string" ? params.query : undefined,
				domain: typeof params?.domain === "string" ? params.domain : undefined,
			},
		};
	}

	if (typeof params?.actionId !== "string" || params.actionId.length === 0) {
		throw new ActionRpcError("INVALID_REQUEST", "params.actionId is required");
	}

	if (method === "actions.describe") {
		return {
			id,
			method,
			params: {
				actionId: params.actionId,
			},
		};
	}

	return {
		id,
		method,
		params: {
			actionId: params.actionId,
			input: params.input,
		},
	};
}
