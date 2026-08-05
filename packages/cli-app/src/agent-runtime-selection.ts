import { createAgentCliBootstrap, resolveCodingAgentSessionDir } from "@vetta/coding-agent/bootstrap";
import { runCodingAgentCliControl } from "@vetta/coding-agent/cli-control";
import type { CodingAgentHtmlExportRuntime } from "@vetta/coding-agent/export-html";
import { type RpcRuntimeDecision, stringifyRpcStartupFailure } from "@vetta/coding-agent/rpc";
import { ConversationOwnershipConflictError } from "@vetta/runtime-storage/conversation";
import { classifyAgentCliIntent } from "./agent-cli-intent.js";
import { ExtensionCompatibilityError } from "./extension-compatibility-error.js";
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
import { SessionCompatibilityError } from "./session-compatibility-error.js";

export type AgentRuntimeBackend = "legacy" | "greenfield" | "greenfield-im";

export interface AgentRuntimeSelection {
	readonly backend: AgentRuntimeBackend;
	readonly effectiveBackend: Exclude<AgentRuntimeBackend, "legacy">;
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
	readonly htmlExporter?: CodingAgentHtmlExportRuntime;
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

	const requestedBackend = backend ?? defaultBackend(agentArgs);
	return {
		backend: requestedBackend,
		effectiveBackend: requestedBackend === "legacy" ? defaultBackend(agentArgs) : requestedBackend,
		agentArgs,
	};
}

export async function runAgentRuntimeCli(
	args: readonly string[],
	options: RunAgentRuntimeCliOptions = {},
): Promise<void> {
	const selection = parseAgentRuntimeSelection(args);
	assertSupportedSessionSelection(selection.agentArgs);
	const intent = classifyAgentCliIntent(selection.agentArgs);
	if (intent === "control") {
		if (!(await runCodingAgentCliControl(selection.agentArgs, { htmlExporter: options.htmlExporter }))) {
			throw new Error("CLI control intent was not handled by the Coding Agent control host");
		}
		return;
	}
	const bootstrap = await createAgentCliBootstrap(selection.agentArgs);
	const conversationDir = resolveCodingAgentSessionDir(bootstrap.cwd, bootstrap.parsed.sessionDir);
	const sessionCatalog = createCliRuntimeSessionCatalog({ cwd: bootstrap.cwd, sessionDir: conversationDir });

	try {
		if (intent === "print" && selection.effectiveBackend === "greenfield-im") {
			throw new Error("Greenfield IM Runtime only supports RPC mode");
		}
		const prepared = await (intent === "print"
			? prepareGreenfieldPrintRuntimeHost({
					bootstrap,
					conversationDir,
					sessionCatalog,
					requestedBackend: selection.backend,
					htmlExporter: options.htmlExporter,
				})
			: selection.effectiveBackend === "greenfield-im"
				? prepareGreenfieldImRuntimeHost({
						bootstrap,
						conversationDir,
						sessionCatalog,
						requestedBackend: selection.backend,
						htmlExporter: options.htmlExporter,
					})
				: prepareGreenfieldRpcRuntimeHost({
						bootstrap,
						conversationDir,
						sessionCatalog,
						requestedBackend: selection.backend,
						htmlExporter: options.htmlExporter,
					}));
		if (prepared.kind === "extension-incompatible") {
			throw new ExtensionCompatibilityError(selection.backend, prepared.extensionCompatibility);
		}
		if (prepared.kind === "session-incompatible") {
			throw new SessionCompatibilityError(selection.backend, prepared.sessionCompatibility);
		}
		options.onDecision?.(prepared.runtimeDecision);
		if (prepared.kind === "greenfield-print") await runGreenfieldPrintRuntimeHost(prepared);
		else if (selection.effectiveBackend === "greenfield-im") await runGreenfieldImRuntimeHost(prepared);
		else await runGreenfieldRpcRuntimeHost(prepared);
	} catch (error) {
		if (error instanceof ExtensionCompatibilityError) {
			if (intent === "rpc") process.stdout.write(stringifyRpcStartupFailure(error.toRpcStartupFailure()));
			else writeExtensionCompatibilityFailure(error);
			process.exitCode = 2;
			return;
		}
		if (error instanceof SessionCompatibilityError) {
			if (intent === "rpc") process.stdout.write(stringifyRpcStartupFailure(error.toRpcStartupFailure()));
			else writeSessionCompatibilityFailure(error);
			process.exitCode = 2;
			return;
		}
		if (!(error instanceof ConversationOwnershipConflictError)) throw error;
		process.stdout.write(
			stringifyRpcStartupFailure({
				type: "response",
				command: "startup",
				success: false,
				error: error.message,
				...(error.holder
					? {
							lockHolder: {
								pid: error.holder.pid,
								hostname: error.holder.hostname,
								openedAt: error.holder.acquiredAt,
							},
						}
					: {}),
			}),
		);
		process.exitCode = 2;
	}
}

function writeSessionCompatibilityFailure(error: SessionCompatibilityError): void {
	const version = error.sourceVersion === undefined ? "" : ` sourceVersion=${error.sourceVersion}`;
	const issue = error.issueCode === undefined ? "" : ` issue=${error.issueCode}:${error.issueCount ?? 1}`;
	process.stderr.write(
		`[agent-runtime] startup failed errorCode=${error.errorCode} requested=${error.requestedBackend} session=${error.sessionPath}${version}${issue}: ${error.message}\n`,
	);
}

function writeExtensionCompatibilityFailure(error: ExtensionCompatibilityError): void {
	const unsupportedEvents = formatRuntimeDecisionList("unsupportedEvents", error.unsupportedEvents);
	const unmetCapabilities = formatRuntimeDecisionList("unmetCapabilities", error.unmetRuntimeCapabilities);
	process.stderr.write(
		`[agent-runtime] startup failed errorCode=${error.errorCode} requested=${error.requestedBackend}${unsupportedEvents}${unmetCapabilities}: ${error.message}\n`,
	);
}

export function writeAgentRuntimeDecision(decision: AgentRuntimeDecision): void {
	const fallback = decision.fallbackReason ? ` fallback=${decision.fallbackReason}` : "";
	const retirement =
		decision.requestedBackend === "legacy" && decision.effectiveBackend !== "legacy" ? " reason=legacy-retired" : "";
	const legacyNotice = decision.effectiveBackend === "legacy" ? "; using Legacy runtime" : "";
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
		`[agent-runtime] requested=${decision.requestedBackend} effective=${decision.effectiveBackend}${retirement}${fallback}${migration}${unsupportedEvents}${unmetCapabilities}${legacyNotice}\n`,
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

function defaultBackend(args: readonly string[]): Exclude<AgentRuntimeBackend, "legacy"> {
	const intent = classifyAgentCliIntent(args);
	if (intent === "control") return "greenfield";
	if (intent === "print") return "greenfield";
	return args.includes("--enable-host-bridge") || args.some((arg) => arg === "--scenario=im-claw")
		? "greenfield-im"
		: "greenfield";
}
