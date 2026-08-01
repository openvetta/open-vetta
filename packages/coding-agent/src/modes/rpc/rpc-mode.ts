/**
 * Headless JSONL RPC host adapter.
 *
 * The wire protocol, command dispatcher and session implementation are kept
 * separate so the transport does not depend on AgentSession internals.
 */

import type { Readable, Writable } from "node:stream";
import type { AgentSession } from "../../core/agent-session.js";
import { LegacyRpcSessionAdapter } from "./legacy-rpc-session-adapter.js";
import { createRpcCommandDispatcher, type RpcFrameOutput, rpcError } from "./rpc-command-dispatcher.js";
import { RpcExtensionUIBridge } from "./rpc-extension-ui-bridge.js";
import { validateRpcInboundFrame } from "./rpc-frame-validator.js";
import { RpcHostBridge } from "./rpc-host-bridge.js";
import { RpcJsonlTransport } from "./rpc-jsonl-transport.js";
import { assertRpcSessionCapabilities, type RpcSessionCapabilities } from "./rpc-session-capabilities.js";

export type {
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcResponse,
	RpcRuntimeDecision,
	RpcSessionState,
} from "./rpc-types.js";

import type { RpcRuntimeDecision } from "./rpc-types.js";

export interface RunRpcModeOptions {
	/** Register the im_send_attachment tool and accept host_response frames. */
	enableHostBridge?: boolean;
	/** Runtime selector decision exposed by get_state for host observation. */
	runtimeDecision?: RpcRuntimeDecision;
}

interface RpcModeRuntimeOptions extends RunRpcModeOptions {
	readonly input?: Readable;
	readonly output?: Writable;
	readonly exit?: (code: number) => void;
}

export async function runRpcMode(session: AgentSession, options: RunRpcModeOptions = {}): Promise<never> {
	return runRpcModeWithCapabilities(new LegacyRpcSessionAdapter(session, options.runtimeDecision), options);
}

export async function runRpcModeWithCapabilities(
	session: RpcSessionCapabilities,
	options: RpcModeRuntimeOptions = {},
): Promise<never> {
	assertRpcSessionCapabilities(session, {
		hostBridgeEnabled: options.enableHostBridge === true,
	});
	const transport = new RpcJsonlTransport(options.input ?? process.stdin, options.output ?? process.stdout);
	const output: RpcFrameOutput = (frame) => transport.write(frame);
	const extensionUI = new RpcExtensionUIBridge(output);
	const hostBridge = options.enableHostBridge ? new RpcHostBridge(output) : undefined;
	const dispatch = createRpcCommandDispatcher(session, output);
	const exit = options.exit ?? ((code: number): never => process.exit(code));
	let shutdownRequested = false;

	try {
		await session.initialize({
			uiContext: extensionUI.createContext(),
			hostBridge: hostBridge?.createBridge(),
			onShutdownRequested: () => {
				shutdownRequested = true;
			},
			onExtensionError: (error) => {
				output({
					type: "extension_error",
					extensionPath: error.extensionPath,
					event: error.event,
					error: error.error,
				});
			},
		});
	} catch (error) {
		extensionUI.dispose();
		hostBridge?.dispose();
		try {
			await session.dispose();
		} catch (disposeError) {
			throw new AggregateError([error, disposeError], "RPC initialization and cleanup both failed");
		}
		throw error;
	}

	const unsubscribe = session.subscribe(output);
	let cleanupPromise: Promise<void> | undefined;
	const cleanup = (): Promise<void> => {
		cleanupPromise ??= (async () => {
			unsubscribe();
			extensionUI.dispose();
			hostBridge?.dispose();
			await session.dispose();
		})();
		return cleanupPromise;
	};

	const handleLine = async (line: string): Promise<void> => {
		try {
			const frame = validateRpcInboundFrame(JSON.parse(line));
			switch (frame.kind) {
				case "extension_ui_response":
					extensionUI.handle(frame.value);
					return;
				case "host_response":
					hostBridge?.handle(frame.value);
					return;
				case "unknown":
					output(rpcError(undefined, frame.type, `Unknown command: ${frame.type}`));
					return;
				case "invalid":
					throw new Error(frame.message);
				case "command": {
					const response = await dispatch(frame.value);
					output(response);
					if (shutdownRequested) {
						await session.shutdown();
						transport.close();
					}
					return;
				}
			}
		} catch (error: unknown) {
			output(rpcError(undefined, "parse", `Failed to parse command: ${errorMessage(error)}`));
		}
	};

	transport.start(
		(line) => {
			void handleLine(line);
		},
		() => {
			void cleanup().then(
				() => exit(0),
				(error: unknown) => {
					output(rpcError(undefined, "shutdown", `Failed to dispose RPC session: ${errorMessage(error)}`));
					exit(1);
				},
			);
		},
	);

	return new Promise(() => {});
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
