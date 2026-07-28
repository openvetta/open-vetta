import { type RpcSessionCapabilities, supportsRpcCommand } from "./rpc-session-capabilities.js";
import type { RpcCommand, RpcResponse } from "./rpc-types.js";

export type RpcFrameOutput = (frame: unknown) => void;

export function rpcSuccess<T extends RpcCommand["type"]>(
	id: string | undefined,
	command: T,
	data?: object | null,
): RpcResponse {
	if (data === undefined) {
		return { id, type: "response", command, success: true } as RpcResponse;
	}
	return { id, type: "response", command, success: true, data } as RpcResponse;
}

export function rpcError(id: string | undefined, command: string, message: string): RpcResponse {
	return { id, type: "response", command, success: false, error: message };
}

export function createRpcCommandDispatcher(
	session: RpcSessionCapabilities,
	output: RpcFrameOutput,
): (command: RpcCommand) => Promise<RpcResponse> {
	return async (command) => {
		const id = command.id;
		if (!supportsRpcCommand(session.profile, command.type)) {
			return rpcError(
				id,
				command.type,
				`Command ${command.type} is not supported by RPC profile ${session.profile.id}`,
			);
		}
		switch (command.type) {
			case "prompt": {
				requireCapability(session.turn, "turn", command.type)
					.prompt(command.message, {
						images: command.images,
						streamingBehavior: command.streamingBehavior,
						source: "rpc",
					})
					.catch((error: unknown) => output(rpcError(id, "prompt", errorMessage(error))));
				return rpcSuccess(id, "prompt");
			}
			case "steer": {
				await requireCapability(session.turn, "turn", command.type).steer(command.message, command.images);
				return rpcSuccess(id, "steer");
			}
			case "follow_up": {
				await requireCapability(session.turn, "turn", command.type).followUp(command.message, command.images);
				return rpcSuccess(id, "follow_up");
			}
			case "abort": {
				await requireCapability(session.turn, "turn", command.type).abort();
				return rpcSuccess(id, "abort");
			}
			case "new_session": {
				const cancelled = !(await requireCapability(session.session, "session", command.type).newSession(
					command.parentSession,
				));
				return rpcSuccess(id, "new_session", { cancelled });
			}
			case "get_state": {
				const state = await requireCapability(session.state, "state", command.type).readState();
				return rpcSuccess(id, "get_state", state);
			}
			case "set_model": {
				const model = await requireCapability(session.model, "model", command.type).selectModel(
					command.provider,
					command.modelId,
				);
				if (!model) {
					return rpcError(id, "set_model", `Model not found: ${command.provider}/${command.modelId}`);
				}
				return rpcSuccess(id, "set_model", model);
			}
			case "cycle_model": {
				const result = await requireCapability(session.model, "model", command.type).cycleModel();
				return rpcSuccess(id, "cycle_model", result ?? null);
			}
			case "get_available_models": {
				const models = await requireCapability(session.model, "model", command.type).readAvailableModels();
				return rpcSuccess(id, "get_available_models", { models: [...models] });
			}
			case "set_thinking_level": {
				requireCapability(session.model, "model", command.type).setThinkingLevel(command.level);
				return rpcSuccess(id, "set_thinking_level");
			}
			case "cycle_thinking_level": {
				const level = requireCapability(session.model, "model", command.type).cycleThinkingLevel();
				return rpcSuccess(id, "cycle_thinking_level", level ? { level } : null);
			}
			case "set_steering_mode": {
				requireCapability(session.queue, "queue", command.type).setSteeringMode(command.mode);
				return rpcSuccess(id, "set_steering_mode");
			}
			case "set_follow_up_mode": {
				requireCapability(session.queue, "queue", command.type).setFollowUpMode(command.mode);
				return rpcSuccess(id, "set_follow_up_mode");
			}
			case "compact": {
				const result = await requireCapability(session.context, "context", command.type).compact(
					command.customInstructions,
				);
				return rpcSuccess(id, "compact", result);
			}
			case "set_auto_compaction": {
				requireCapability(session.context, "context", command.type).setAutoCompactionEnabled(command.enabled);
				return rpcSuccess(id, "set_auto_compaction");
			}
			case "flush_memory": {
				const written = await requireCapability(session.memory, "memory", command.type).flushMemory();
				return rpcSuccess(id, "flush_memory", { written });
			}
			case "set_auto_retry": {
				requireCapability(session.retry, "retry", command.type).setAutoRetryEnabled(command.enabled);
				return rpcSuccess(id, "set_auto_retry");
			}
			case "abort_retry": {
				requireCapability(session.retry, "retry", command.type).abortRetry();
				return rpcSuccess(id, "abort_retry");
			}
			case "bash": {
				const result = await requireCapability(session.bash, "bash", command.type).execute(command.command);
				return rpcSuccess(id, "bash", result);
			}
			case "abort_bash": {
				requireCapability(session.bash, "bash", command.type).abort();
				return rpcSuccess(id, "abort_bash");
			}
			case "get_session_stats":
				return rpcSuccess(
					id,
					"get_session_stats",
					requireCapability(session.session, "session", command.type).readStats(),
				);
			case "export_html": {
				const path = await requireCapability(session.session, "session", command.type).exportHtml(
					command.outputPath,
				);
				return rpcSuccess(id, "export_html", { path });
			}
			case "switch_session": {
				const cancelled = !(await requireCapability(session.session, "session", command.type).switchSession(
					command.sessionPath,
				));
				return rpcSuccess(id, "switch_session", { cancelled });
			}
			case "fork": {
				const result = await requireCapability(session.session, "session", command.type).fork(command.entryId);
				return rpcSuccess(id, "fork", result);
			}
			case "get_fork_messages":
				return rpcSuccess(id, "get_fork_messages", {
					messages: [...requireCapability(session.session, "session", command.type).readForkMessages()],
				});
			case "get_last_assistant_text": {
				const text = requireCapability(session.session, "session", command.type).readLastAssistantText();
				return rpcSuccess(id, "get_last_assistant_text", { text });
			}
			case "set_session_name": {
				const name = command.name.trim();
				if (!name) {
					return rpcError(id, "set_session_name", "Session name cannot be empty");
				}
				requireCapability(session.session, "session", command.type).setName(name);
				return rpcSuccess(id, "set_session_name");
			}
			case "get_messages":
				return rpcSuccess(id, "get_messages", {
					messages: [...requireCapability(session.state, "state", command.type).readMessages()],
				});
			case "get_commands":
				return rpcSuccess(id, "get_commands", {
					commands: [...requireCapability(session.commands, "commands", command.type).readCommands()],
				});
			default: {
				const unknownCommand = command as { type: string };
				return rpcError(undefined, unknownCommand.type, `Unknown command: ${unknownCommand.type}`);
			}
		}
	};
}

function requireCapability<T>(capability: T | undefined, name: string, command: string): T {
	if (!capability) {
		throw new Error(`RPC capability ${name} is unavailable for command ${command}`);
	}
	return capability;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
