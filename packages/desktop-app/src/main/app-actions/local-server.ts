import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
	type ActionRpcEndpoint,
	type ActionRpcRuntime,
	type ActionRpcServerHandle,
	startActionRpcServer,
} from "@vetta/action-rpc";
import { getActionServerEndpointFilePath } from "./endpoint-file.js";
import type { AppActionRuntime, JsonValue } from "./index.js";

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

function createRpcRuntime(runtime: AppActionRuntime): ActionRpcRuntime {
	return {
		search: (options) => runtime.search(options),
		describe: (actionId) => runtime.describe(actionId),
		run: async (actionId, input): Promise<JsonValue> =>
			await runtime.run(actionId, input ?? {}, { source: "local-server" }),
	};
}

export async function startLocalActionServer(
	runtime: AppActionRuntime,
	options: StartLocalActionServerOptions = {},
): Promise<LocalActionServerHandle> {
	const endpointFilePath = options.endpointFilePath ?? getActionServerEndpointFilePath();
	const token = createToken();
	await mkdir(dirname(endpointFilePath), { recursive: true });

	const server: ActionRpcServerHandle = await startActionRpcServer(createRpcRuntime(runtime), {
		host: "127.0.0.1",
		port: 0,
		token,
	});

	await writeFile(endpointFilePath, `${JSON.stringify(server.endpoint, null, 2)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});

	return {
		endpoint: server.endpoint,
		close: async () => {
			await server.close();
			await rm(endpointFilePath, { force: true });
		},
	};
}
