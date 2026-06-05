import type { Server } from "node:http";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { ActionRpcError } from "./errors.js";
import { parseActionRpcRequest } from "./protocol.js";
import type { ActionRpcEndpoint, ActionRpcErrorBody, ActionRpcResponse, ActionRpcRuntime } from "./types.js";

export interface ActionRpcServerHandle {
	endpoint: ActionRpcEndpoint;
	close: () => Promise<void>;
}

export interface StartActionRpcServerOptions {
	host?: string;
	port?: number;
	token: string;
}

function errorBody(err: unknown): ActionRpcErrorBody {
	if (err instanceof ActionRpcError) {
		return {
			code: err.code,
			message: err.message,
			details: err.details,
		};
	}
	if (err instanceof Error) {
		return {
			code: "ACTION_RPC_ERROR",
			message: err.message,
		};
	}
	return {
		code: "ACTION_RPC_ERROR",
		message: "Unknown action RPC error",
	};
}

function getBearerToken(value: string | undefined): string | undefined {
	const prefix = "Bearer ";
	if (!value?.startsWith(prefix)) return undefined;
	return value.slice(prefix.length);
}

async function dispatch(
	runtime: ActionRpcRuntime,
	request: ReturnType<typeof parseActionRpcRequest>,
	signal: AbortSignal,
) {
	if (request.method === "actions.search") {
		return await runtime.search({
			query: request.params?.query,
			domain: request.params?.domain,
		});
	}
	if (request.method === "actions.describe") {
		return await runtime.describe(request.params.actionId);
	}
	return await runtime.run(request.params.actionId, request.params.input ?? {}, {
		requestId: request.id,
		signal,
	});
}

export async function startActionRpcServer(
	runtime: ActionRpcRuntime,
	options: StartActionRpcServerOptions,
): Promise<ActionRpcServerHandle> {
	const host = options.host ?? "127.0.0.1";
	const app = new Hono();

	app.get("/health", (c) => c.json({ ok: true }));
	app.post("/rpc", async (c) => {
		let id = "unknown";
		try {
			if (getBearerToken(c.req.header("authorization")) !== options.token) {
				throw new ActionRpcError("UNAUTHORIZED", "Invalid action RPC token");
			}
			const request = parseActionRpcRequest(await c.req.json());
			id = request.id;
			const result = await dispatch(runtime, request, c.req.raw.signal);
			return c.json({ id, ok: true, result } satisfies ActionRpcResponse);
		} catch (err) {
			return c.json({ id, ok: false, error: errorBody(err) } satisfies ActionRpcResponse, 400);
		}
	});

	const { server, port } = await new Promise<{ server: Server; port: number }>((resolve) => {
		const server = serve(
			{
				fetch: app.fetch,
				hostname: host,
				port: options.port ?? 0,
			},
			(info) => {
				resolve({ server, port: info.port });
			},
		) as Server;
	});

	return {
		endpoint: {
			transport: "http",
			url: `http://${host}:${port}`,
			token: options.token,
		},
		close: async () => {
			await new Promise<void>((resolve, reject) => {
				server.close((err) => {
					if (err) reject(err);
					else resolve();
				});
			});
		},
	};
}
