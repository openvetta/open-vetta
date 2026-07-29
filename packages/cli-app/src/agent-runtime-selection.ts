import { createLegacyAgentBootstrap, main as runLegacyAgent, runLegacyAgentWithBootstrap } from "@vetta/coding-agent";
import { ConversationOwnershipConflictError } from "@vetta/runtime-storage/conversation";
import { prepareGreenfieldImRuntimeHost, runGreenfieldImRuntimeHost } from "./rpc/greenfield-im-runtime-host.js";

export type AgentRuntimeBackend = "legacy" | "greenfield-im";

export interface AgentRuntimeSelection {
	readonly backend: AgentRuntimeBackend;
	readonly agentArgs: string[];
}

const RUNTIME_OPTION = "--agent-runtime";

export function parseAgentRuntimeSelection(args: readonly string[]): AgentRuntimeSelection {
	let backend: AgentRuntimeBackend = "legacy";
	const agentArgs: string[] = [];

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === RUNTIME_OPTION) {
			const value = args[index + 1];
			if (!value) throw new Error(`${RUNTIME_OPTION} requires a value`);
			backend = parseBackend(value);
			index += 1;
			continue;
		}
		if (arg.startsWith(`${RUNTIME_OPTION}=`)) {
			backend = parseBackend(arg.slice(RUNTIME_OPTION.length + 1));
			continue;
		}
		agentArgs.push(arg);
	}

	return { backend, agentArgs };
}

export async function runAgentRuntimeCli(args: readonly string[]): Promise<void> {
	const selection = parseAgentRuntimeSelection(args);
	if (selection.backend === "legacy") {
		await runLegacyAgent(selection.agentArgs);
		return;
	}

	const bootstrap = await createLegacyAgentBootstrap(selection.agentArgs);
	const conversationDir = bootstrap.parsed.sessionDir;
	if (!conversationDir) {
		throw new Error("Greenfield IM Runtime requires --session-dir");
	}

	try {
		const prepared = await prepareGreenfieldImRuntimeHost({ bootstrap, conversationDir });
		if (prepared.kind === "legacy-fallback") {
			console.warn(`[agent-runtime] Greenfield unavailable (${prepared.reason}); using Legacy runtime`);
			await runLegacyAgentWithBootstrap(prepared.bootstrap);
			return;
		}
		await runGreenfieldImRuntimeHost(prepared);
	} catch (error) {
		if (!(error instanceof ConversationOwnershipConflictError)) throw error;
		process.stdout.write(
			`${JSON.stringify({
				type: "response",
				command: "startup",
				success: false,
				error: error.message,
				lockHolder: error.holder
					? {
							pid: error.holder.pid,
							hostname: error.holder.hostname,
							openedAt: error.holder.acquiredAt,
						}
					: undefined,
			})}\n`,
		);
		process.exitCode = 2;
	}
}

function parseBackend(value: string): AgentRuntimeBackend {
	if (value === "legacy" || value === "greenfield-im") return value;
	throw new Error(`Unsupported ${RUNTIME_OPTION} value: ${value}`);
}
