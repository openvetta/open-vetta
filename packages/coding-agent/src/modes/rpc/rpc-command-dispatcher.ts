import type { RpcSessionCapabilities } from "./rpc-session-capabilities.js";
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
		switch (command.type) {
			case "prompt": {
				session.turn
					.prompt(command.message, {
						images: command.images,
						streamingBehavior: command.streamingBehavior,
						source: "rpc",
					})
					.catch((error: unknown) => output(rpcError(id, "prompt", errorMessage(error))));
				return rpcSuccess(id, "prompt");
			}
			case "steer": {
				await session.turn.steer(command.message, command.images);
				return rpcSuccess(id, "steer");
			}
			case "follow_up": {
				await session.turn.followUp(command.message, command.images);
				return rpcSuccess(id, "follow_up");
			}
			case "abort": {
				await session.turn.abort();
				return rpcSuccess(id, "abort");
			}
			case "new_session": {
				const cancelled = !(await session.session.newSession(command.parentSession));
				return rpcSuccess(id, "new_session", { cancelled });
			}
			case "get_state":
				return rpcSuccess(id, "get_state", session.state.readState());
			case "set_model": {
				const model = await session.model.selectModel(command.provider, command.modelId);
				if (!model) {
					return rpcError(id, "set_model", `Model not found: ${command.provider}/${command.modelId}`);
				}
				return rpcSuccess(id, "set_model", model);
			}
			case "cycle_model": {
				const result = await session.model.cycleModel();
				return rpcSuccess(id, "cycle_model", result ?? null);
			}
			case "get_available_models": {
				const models = await session.model.readAvailableModels();
				return rpcSuccess(id, "get_available_models", { models: [...models] });
			}
			case "set_thinking_level": {
				session.model.setThinkingLevel(command.level);
				return rpcSuccess(id, "set_thinking_level");
			}
			case "cycle_thinking_level": {
				const level = session.model.cycleThinkingLevel();
				return rpcSuccess(id, "cycle_thinking_level", level ? { level } : null);
			}
			case "set_steering_mode": {
				session.queue.setSteeringMode(command.mode);
				return rpcSuccess(id, "set_steering_mode");
			}
			case "set_follow_up_mode": {
				session.queue.setFollowUpMode(command.mode);
				return rpcSuccess(id, "set_follow_up_mode");
			}
			case "compact": {
				const result = await session.context.compact(command.customInstructions);
				return rpcSuccess(id, "compact", result);
			}
			case "set_auto_compaction": {
				session.context.setAutoCompactionEnabled(command.enabled);
				return rpcSuccess(id, "set_auto_compaction");
			}
			case "flush_memory": {
				const written = await session.memory.flushMemory();
				return rpcSuccess(id, "flush_memory", { written });
			}
			case "set_auto_retry": {
				session.retry.setAutoRetryEnabled(command.enabled);
				return rpcSuccess(id, "set_auto_retry");
			}
			case "abort_retry": {
				session.retry.abortRetry();
				return rpcSuccess(id, "abort_retry");
			}
			case "bash": {
				const result = await session.bash.execute(command.command);
				return rpcSuccess(id, "bash", result);
			}
			case "abort_bash": {
				session.bash.abort();
				return rpcSuccess(id, "abort_bash");
			}
			case "get_session_stats":
				return rpcSuccess(id, "get_session_stats", session.session.readStats());
			case "export_html": {
				const path = await session.session.exportHtml(command.outputPath);
				return rpcSuccess(id, "export_html", { path });
			}
			case "switch_session": {
				const cancelled = !(await session.session.switchSession(command.sessionPath));
				return rpcSuccess(id, "switch_session", { cancelled });
			}
			case "fork": {
				const result = await session.session.fork(command.entryId);
				return rpcSuccess(id, "fork", result);
			}
			case "get_fork_messages":
				return rpcSuccess(id, "get_fork_messages", { messages: [...session.session.readForkMessages()] });
			case "get_last_assistant_text": {
				const text = session.session.readLastAssistantText();
				return rpcSuccess(id, "get_last_assistant_text", { text });
			}
			case "set_session_name": {
				const name = command.name.trim();
				if (!name) {
					return rpcError(id, "set_session_name", "Session name cannot be empty");
				}
				session.session.setName(name);
				return rpcSuccess(id, "set_session_name");
			}
			case "get_messages":
				return rpcSuccess(id, "get_messages", { messages: [...session.state.readMessages()] });
			case "get_commands":
				return rpcSuccess(id, "get_commands", { commands: [...session.commands.readCommands()] });
			default: {
				const unknownCommand = command as { type: string };
				return rpcError(undefined, unknownCommand.type, `Unknown command: ${unknownCommand.type}`);
			}
		}
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
