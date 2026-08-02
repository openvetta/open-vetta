import { createAgentCliBootstrap, resolveCodingAgentSessionDir } from "@vetta/coding-agent/bootstrap";
import { main as runLegacyAgent, runLegacyAgentWithBootstrap } from "@vetta/coding-agent/legacy/cli";
import type { RpcRuntimeDecision } from "@vetta/coding-agent/rpc";
import { ConversationOwnershipConflictError } from "@vetta/runtime-storage/conversation";
import { classifyAgentCliIntent } from "./agent-cli-intent.js";
import { createCliRuntimeSessionCatalog } from "./rpc/cli-session-format-compatibility.js";
import {
	type GreenfieldImFallbackReason,
	prepareGreenfieldImRuntimeHost,
	runGreenfieldImRuntimeHost,
} from "./rpc/greenfield-im-runtime-host.js";
import {
	prepareGreenfieldPrintRuntimeHost,
	prepareGreenfieldRpcRuntimeHost,
	runGreenfieldPrintRuntimeHost,
	runGreenfieldRpcRuntimeHost,
} from "./rpc/greenfield-rpc-runtime-host.js";
import { assertAllowedAutomaticLegacyRuntimeFallback } from "./rpc/legacy-runtime-fallback-policy.js";

export type AgentRuntimeBackend = "legacy" | "greenfield" | "greenfield-im";

export interface AgentRuntimeSelection {
	readonly backend: AgentRuntimeBackend;
	readonly agentArgs: string[];
}

export interface AgentRuntimeDecision extends RpcRuntimeDecision {
	readonly fallbackReason?: GreenfieldImFallbackReason;
}

export interface AgentRuntimeExtensionFallbackDiagnostics {
	readonly unsupportedEvents: readonly string[];
	readonly unmetRuntimeCapabilities: readonly string[];
}

export interface RunAgentRuntimeCliOptions {
	readonly onDecision?: (decision: AgentRuntimeDecision) => void;
}

const RUNTIME_OPTION = "--agent-runtime";

export function parseAgentRuntimeSelection(args: readonly string[]): AgentRuntimeSelection {
	let backend: AgentRuntimeBackend | undefined;
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

	return { backend: backend ?? defaultBackend(agentArgs), agentArgs };
}

export async function runAgentRuntimeCli(
	args: readonly string[],
	options: RunAgentRuntimeCliOptions = {},
): Promise<void> {
	const selection = parseAgentRuntimeSelection(args);
	assertSupportedSessionSelection(selection.agentArgs);
	const intent = classifyAgentCliIntent(selection.agentArgs);
	if (intent === "control") {
		await runLegacyAgent(selection.agentArgs);
		return;
	}
	if (selection.backend === "legacy") {
		options.onDecision?.({
			requestedBackend: "legacy",
			effectiveBackend: "legacy",
		});
		await runLegacyAgent(selection.agentArgs);
		return;
	}

	const bootstrap = await createAgentCliBootstrap(selection.agentArgs);
	const conversationDir = resolveCodingAgentSessionDir(bootstrap.cwd, bootstrap.parsed.sessionDir);
	const sessionCatalog = createCliRuntimeSessionCatalog({ cwd: bootstrap.cwd, sessionDir: conversationDir });

	try {
		if (intent === "print" && selection.backend === "greenfield-im") {
			throw new Error("Greenfield IM Runtime only supports RPC mode");
		}
		const prepared = await (intent === "print"
			? prepareGreenfieldPrintRuntimeHost({ bootstrap, conversationDir, sessionCatalog })
			: selection.backend === "greenfield-im"
				? prepareGreenfieldImRuntimeHost({ bootstrap, conversationDir, sessionCatalog })
				: prepareGreenfieldRpcRuntimeHost({ bootstrap, conversationDir, sessionCatalog }));
		if (prepared.kind === "legacy-fallback") {
			assertAllowedAutomaticLegacyRuntimeFallback(prepared);
			const decision = {
				requestedBackend: selection.backend,
				effectiveBackend: "legacy",
				fallbackReason: prepared.reason,
				...(prepared.extensionCompatibility
					? {
							extensionFallback: {
								unsupportedEvents: prepared.extensionCompatibility.unsupportedEvents,
								unmetRuntimeCapabilities: prepared.extensionCompatibility.unmetRuntimeCapabilities,
							},
						}
					: {}),
				...(prepared.sessionMigration ? { sessionMigration: prepared.sessionMigration } : {}),
			} as const satisfies AgentRuntimeDecision;
			if (options.onDecision) options.onDecision(decision);
			else console.warn(`[agent-runtime] Greenfield unavailable (${prepared.reason}); using Legacy runtime`);
			await runLegacyAgentWithBootstrap(prepared.bootstrap, { rpcRuntimeDecision: decision });
			return;
		}
		options.onDecision?.(prepared.runtimeDecision);
		if (prepared.kind === "greenfield-print") await runGreenfieldPrintRuntimeHost(prepared);
		else if (selection.backend === "greenfield-im") await runGreenfieldImRuntimeHost(prepared);
		else await runGreenfieldRpcRuntimeHost(prepared);
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

export function writeAgentRuntimeDecision(decision: AgentRuntimeDecision): void {
	const fallback = decision.fallbackReason ? ` fallback=${decision.fallbackReason}` : "";
	const legacyNotice = decision.fallbackReason ? "; using Legacy runtime" : "";
	const unsupportedEvents = formatRuntimeDecisionList(
		"unsupportedEvents",
		decision.extensionFallback?.unsupportedEvents,
	);
	const unmetCapabilities = formatRuntimeDecisionList(
		"unmetCapabilities",
		decision.extensionFallback?.unmetRuntimeCapabilities,
	);
	const migration = decision.sessionMigration
		? ` sessionMigration=${decision.sessionMigration.status}${decision.sessionMigration.errorCode ? `:${decision.sessionMigration.errorCode}` : ""}${decision.sessionMigration.issueCode ? ` issue=${decision.sessionMigration.issueCode}:${decision.sessionMigration.issueCount ?? 1}` : ""}`
		: "";
	process.stderr.write(
		`[agent-runtime] requested=${decision.requestedBackend} effective=${decision.effectiveBackend}${fallback}${migration}${unsupportedEvents}${unmetCapabilities}${legacyNotice}\n`,
	);
}

function assertSupportedSessionSelection(args: readonly string[]): void {
	if (args.includes("--resume") || args.includes("-r")) {
		throw new Error("--resume is no longer supported; use --continue or --session");
	}
}

function formatRuntimeDecisionList(label: string, values: readonly string[] | undefined): string {
	return values && values.length > 0 ? ` ${label}=${values.join(",")}` : "";
}

function parseBackend(value: string): AgentRuntimeBackend {
	if (value === "legacy" || value === "greenfield" || value === "greenfield-im") return value;
	throw new Error(`Unsupported ${RUNTIME_OPTION} value: ${value}`);
}

function defaultBackend(args: readonly string[]): AgentRuntimeBackend {
	const intent = classifyAgentCliIntent(args);
	if (intent === "control") return "legacy";
	if (intent === "print") return "greenfield";
	return args.includes("--enable-host-bridge") || args.some((arg) => arg === "--scenario=im-claw")
		? "greenfield-im"
		: "greenfield";
}
