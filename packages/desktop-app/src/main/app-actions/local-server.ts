import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
	type ActionRpcEndpoint,
	ActionRpcError,
	type ActionRpcRuntime,
	type ActionRpcServerHandle,
	startActionRpcServer,
} from "@vetta/action-rpc";
import { getAppLogger } from "../logger.js";
import { getActionServerEndpointFilePath } from "./endpoint-file.js";
import type { AppActionRuntime, JsonValue } from "./index.js";
import { ActionError } from "./types.js";

const log = getAppLogger("action-rpc");

export interface LocalActionServerHandle {
	endpoint: ActionRpcEndpoint;
	close: () => Promise<void>;
}

export interface StartLocalActionServerOptions {
	endpointFilePath?: string;
}

function createToken(): string {
	return randomBytes(32).toString("hex");
}

async function toActionRpcResult<T>(operation: () => Promise<T> | T): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		if (error instanceof ActionError) {
			throw new ActionRpcError(error.code, error.message, error.details);
		}
		log.error("toActionRpcResult: unexpected error", error);
		throw error;
	}
}

function createRpcRuntime(runtime: AppActionRuntime): ActionRpcRuntime {
	return {
		search: (options) => toActionRpcResult(() => runtime.search(options)),
		describe: (actionId) => toActionRpcResult(() => runtime.describe(actionId)),
		run: async (actionId, input, context): Promise<JsonValue> =>
			await toActionRpcResult(() =>
				runtime.run(actionId, input ?? {}, {
					source: "local-server",
					requestId: context.requestId,
					signal: context.signal,
				}),
			),
	};
}

export async function startLocalActionServer(
	runtime: AppActionRuntime,
	options: StartLocalActionServerOptions = {},
): Promise<LocalActionServerHandle> {
	const endpointFilePath = options.endpointFilePath ?? getActionServerEndpointFilePath();
	const token = createToken();
	try {
		await mkdir(dirname(endpointFilePath), { recursive: true });
	} catch (error) {
		log.error("startLocalActionServer: mkdir failed", { endpointFilePath }, error);
		throw error;
	}

	let server: ActionRpcServerHandle;
	try {
		server = await startActionRpcServer(createRpcRuntime(runtime), {
			host: "127.0.0.1",
			port: 0,
			token,
		});
	} catch (error) {
		log.error("startLocalActionServer: startActionRpcServer failed", error);
		throw error;
	}

	try {
		await writeFile(endpointFilePath, `${JSON.stringify(server.endpoint, null, 2)}\n`, {
			encoding: "utf8",
			mode: 0o600,
		});
	} catch (error) {
		log.error("startLocalActionServer: writeFile failed", { endpointFilePath }, error);
		throw error;
	}

	return {
		endpoint: server.endpoint,
		close: async () => {
			try {
				await server.close();
			} catch (error) {
				log.warn("close: server.close failed", error);
			}
			try {
				await rm(endpointFilePath, { force: true });
			} catch (error) {
				log.warn("close: rm failed", { endpointFilePath }, error);
			}
		},
	};
}
