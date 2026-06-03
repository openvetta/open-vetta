export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ActionRpcMethod = "actions.search" | "actions.describe" | "actions.run";

export type ActionRpcRequest =
	| {
			id: string;
			method: "actions.search";
			params?: {
				query?: string;
				domain?: string;
			};
	  }
	| {
			id: string;
			method: "actions.describe";
			params: {
				actionId: string;
			};
	  }
	| {
			id: string;
			method: "actions.run";
			params: {
				actionId: string;
				input?: unknown;
			};
	  };

export interface ActionRpcErrorBody {
	code: string;
	message: string;
	details?: JsonValue;
}

export type ActionRpcResponse =
	| {
			id: string;
			ok: true;
			result: JsonValue;
	  }
	| {
			id: string;
			ok: false;
			error: ActionRpcErrorBody;
	  };

export interface ActionRpcEndpoint {
	transport: "http";
	url: string;
	token: string;
}

export interface ActionRpcRuntime {
	search: (options: { query?: string; domain?: string }) => JsonValue | Promise<JsonValue>;
	describe: (actionId: string) => JsonValue | Promise<JsonValue>;
	run: (actionId: string, input: unknown) => JsonValue | Promise<JsonValue>;
}
