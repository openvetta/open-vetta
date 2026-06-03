import { ActionRpcError } from "./errors.js";
import type { ActionRpcEndpoint, ActionRpcRequest, ActionRpcResponse } from "./types.js";

type ActionRpcSuccessResponse = Extract<ActionRpcResponse, { ok: true }>;

async function send(endpoint: ActionRpcEndpoint, request: ActionRpcRequest): Promise<ActionRpcSuccessResponse> {
	const response = await fetch(new URL("/rpc", endpoint.url), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${endpoint.token}`,
		},
		body: JSON.stringify(request),
	});
	const payload = (await response.json()) as ActionRpcResponse;
	if (!payload.ok) {
		throw new ActionRpcError(payload.error.code, payload.error.message, payload.error.details);
	}
	return payload;
}

export function createActionRpcClient(endpoint: ActionRpcEndpoint) {
	return {
		search: async (params: { query?: string; domain?: string } = {}) => {
			const response = await send(endpoint, {
				id: crypto.randomUUID(),
				method: "actions.search",
				params,
			});
			return response.result;
		},
		describe: async (actionId: string) => {
			const response = await send(endpoint, {
				id: crypto.randomUUID(),
				method: "actions.describe",
				params: { actionId },
			});
			return response.result;
		},
		run: async (actionId: string, input: unknown = {}) => {
			const response = await send(endpoint, {
				id: crypto.randomUUID(),
				method: "actions.run",
				params: { actionId, input },
			});
			return response.result;
		},
	};
}
