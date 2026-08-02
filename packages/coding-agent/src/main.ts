/**
 * Main entry point for the coding agent CLI.
 *
 * This file handles CLI argument parsing and translates them into
 * createAgentSession() options. The SDK does the heavy lifting.
 */

import { modelsAreEqual, supportsXhigh } from "@vetta/ai";
import chalk from "chalk";
import { createInterface } from "readline";
import type { Args } from "./cli/args.js";
import { getModelsPath } from "./config.js";
import { DEFAULT_THINKING_LEVEL } from "./core/defaults.js";
import type { ModelRegistry } from "./core/model-registry.js";
import { resolveCliModel, resolveModelScope, type ScopedModel } from "./core/model-resolver.js";
import { type CreateAgentSessionOptions, createAgentSession } from "./core/sdk.js";
import { SessionLockError, SessionManager } from "./core/session-manager/index.js";
import type { SettingsManager } from "./core/settings-manager.js";
import { allTools } from "./core/tools/index.js";
import { createAgentCliBootstrap } from "./host/coding-agent-cli-bootstrap.js";
import { runCodingAgentCliControl, runCodingAgentCliControlWithBootstrap } from "./host/coding-agent-cli-control.js";
import type { CodingAgentHostBootstrap } from "./host/coding-agent-host-bootstrap.js";
import {
	prepareCodingAgentPipedStdin,
	prepareCodingAgentPrintInvocation,
} from "./host/coding-agent-print-invocation.js";
import { runPrintMode, runRpcMode } from "./modes/index.js";
import { LegacyPrintSessionAdapter } from "./modes/legacy-print-session-adapter.js";
import type { RpcRuntimeDecision } from "./modes/rpc/rpc-types.js";

/** Result from resolving a session argument */
type ResolvedSession =
	| { type: "path"; path: string } // Direct file path
	| { type: "local"; path: string } // Found in current project
	| { type: "global"; path: string; cwd: string } // Found in different project
	| { type: "not_found"; arg: string }; // Not found anywhere

/**
 * Resolve a session argument to a file path.
 * If it looks like a path, use as-is. Otherwise try to match as session ID prefix.
 */
async function resolveSessionPath(sessionArg: string, cwd: string, sessionDir?: string): Promise<ResolvedSession> {
	// If it looks like a file path, use as-is
	if (sessionArg.includes("/") || sessionArg.includes("\\") || sessionArg.endsWith(".jsonl")) {
		return { type: "path", path: sessionArg };
	}

	// Try to match as session ID in current project first
	const localSessions = await SessionManager.list(cwd, sessionDir);
	const localMatches = localSessions.filter((s) => s.id.startsWith(sessionArg));

	if (localMatches.length >= 1) {
		return { type: "local", path: localMatches[0].path };
	}

	// Try global search across all projects
	const allSessions = await SessionManager.listAll();
	const globalMatches = allSessions.filter((s) => s.id.startsWith(sessionArg));

	if (globalMatches.length >= 1) {
		const match = globalMatches[0];
		return { type: "global", path: match.path, cwd: match.cwd };
	}

	// Not found anywhere
	return { type: "not_found", arg: sessionArg };
}

/** Prompt user for yes/no confirmation */
async function promptConfirm(message: string): Promise<boolean> {
	return new Promise((resolve) => {
		const rl = createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		rl.question(`${message} [y/N] `, (answer) => {
			rl.close();
			resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
		});
	});
}

async function createSessionManager(parsed: Args, cwd: string): Promise<SessionManager | undefined> {
	if (parsed.noSession) {
		return SessionManager.inMemory();
	}
	if (parsed.session) {
		const resolved = await resolveSessionPath(parsed.session, cwd, parsed.sessionDir);

		switch (resolved.type) {
			case "path":
			case "local":
				return SessionManager.open(resolved.path, parsed.sessionDir);

			case "global": {
				// Session found in different project - ask user if they want to fork
				console.log(chalk.yellow(`Session found in different project: ${resolved.cwd}`));
				const shouldFork = await promptConfirm("Fork this session into current directory?");
				if (!shouldFork) {
					console.log(chalk.dim("Aborted."));
					process.exit(0);
				}
				return SessionManager.forkFrom(resolved.path, cwd, parsed.sessionDir);
			}

			case "not_found":
				console.error(chalk.red(`No session found matching '${resolved.arg}'`));
				process.exit(1);
		}
	}
	if (parsed.continue) {
		return SessionManager.continueRecent(cwd, parsed.sessionDir);
	}
	// --resume is handled separately (needs picker UI)
	// If --session-dir provided without --continue/--resume, create new session there
	if (parsed.sessionDir) {
		return SessionManager.create(cwd, parsed.sessionDir);
	}
	// Default case (new session) returns undefined, SDK will create one
	return undefined;
}

function buildSessionOptions(
	parsed: Args,
	scopedModels: ScopedModel[],
	sessionManager: SessionManager | undefined,
	modelRegistry: ModelRegistry,
	settingsManager: SettingsManager,
): { options: CreateAgentSessionOptions; cliThinkingFromModel: boolean } {
	const options: CreateAgentSessionOptions = {};
	let cliThinkingFromModel = false;

	if (sessionManager) {
		options.sessionManager = sessionManager;
	}

	// Model from CLI
	// - supports --provider <name> --model <pattern>
	// - supports --model <provider>/<pattern>
	if (parsed.model) {
		const resolved = resolveCliModel({
			cliProvider: parsed.provider,
			cliModel: parsed.model,
			modelRegistry,
		});
		if (resolved.warning) {
			console.warn(chalk.yellow(`Warning: ${resolved.warning}`));
		}
		if (resolved.error) {
			console.error(chalk.red(resolved.error));
			process.exit(1);
		}
		if (resolved.model) {
			options.model = resolved.model;
			// Allow "--model <pattern>:<thinking>" as a shorthand.
			// Explicit --thinking still takes precedence (applied later).
			if (!parsed.thinking && resolved.thinkingLevel) {
				options.thinkingLevel = resolved.thinkingLevel;
				cliThinkingFromModel = true;
			}
		}
	}

	if (!options.model && scopedModels.length > 0 && !parsed.continue && !parsed.resume) {
		// Check if saved default is in scoped models - use it if so, otherwise first scoped model
		const savedProvider = settingsManager.getDefaultProvider();
		const savedModelId = settingsManager.getDefaultModel();
		const savedModel = savedProvider && savedModelId ? modelRegistry.find(savedProvider, savedModelId) : undefined;
		const savedInScope = savedModel ? scopedModels.find((sm) => modelsAreEqual(sm.model, savedModel)) : undefined;

		if (savedInScope) {
			options.model = savedInScope.model;
			// Use thinking level from scoped model config if explicitly set
			if (!parsed.thinking && savedInScope.thinkingLevel) {
				options.thinkingLevel = savedInScope.thinkingLevel;
			}
		} else {
			options.model = scopedModels[0].model;
			// Use thinking level from first scoped model if explicitly set
			if (!parsed.thinking && scopedModels[0].thinkingLevel) {
				options.thinkingLevel = scopedModels[0].thinkingLevel;
			}
		}
	}

	// Thinking level from CLI (takes precedence over scoped model thinking levels set above)
	if (parsed.thinking) {
		options.thinkingLevel = parsed.thinking;
	}

	// Scoped models for Ctrl+P cycling - fill in default thinking level for models without explicit level
	if (scopedModels.length > 0) {
		const defaultThinkingLevel = settingsManager.getDefaultThinkingLevel() ?? DEFAULT_THINKING_LEVEL;
		options.scopedModels = scopedModels.map((sm) => ({
			model: sm.model,
			thinkingLevel: sm.thinkingLevel ?? defaultThinkingLevel,
		}));
	}

	// API key from CLI - set in authStorage
	// (handled by caller before createAgentSession)

	// Tools
	if (parsed.noTools) {
		// --no-tools: start with no built-in tools
		// --tools can still add specific ones back
		if (parsed.tools && parsed.tools.length > 0) {
			options.tools = parsed.tools.map((name) => allTools[name]);
		} else {
			options.tools = [];
		}
	} else if (parsed.tools) {
		options.tools = parsed.tools.map((name) => allTools[name]);
	}

	// 对话场景（决定按 scope_use 激活哪些工具）。im-gateway 子进程传 --scenario im-claw；
	// 不传则 SDK 用 DEFAULT_SCENARIO("cli")。
	if (parsed.scenario) {
		options.scenario = parsed.scenario;
	}

	return { options, cliThinkingFromModel };
}

export async function main(args: string[]) {
	if (await runCodingAgentCliControl(args)) return;

	const bootstrap = await createAgentCliBootstrap(args);
	await runLegacyAgentWithBootstrap(bootstrap);
}

export { createAgentCliBootstrap } from "./host/coding-agent-cli-bootstrap.js";

/** @deprecated Use createAgentCliBootstrap. Retained only for the explicit Legacy runtime adapter. */
export async function createLegacyAgentBootstrap(args: string[]): Promise<CodingAgentHostBootstrap> {
	return createAgentCliBootstrap(args);
}

/**
 * 使用已经完成的共享宿主启动资源运行 Legacy Agent。
 *
 * Runtime Selector 可以在只加载一次设置、模型与动态资源的前提下选择 Greenfield，
 * 并在 Greenfield 不兼容旧会话时回退到这里。
 */
export async function runLegacyAgentWithBootstrap(
	bootstrap: CodingAgentHostBootstrap,
	options: { readonly rpcRuntimeDecision?: RpcRuntimeDecision } = {},
): Promise<void> {
	const { cwd, parsed, settingsManager, authStorage, modelRegistry, resourceLoader } = bootstrap;
	if (await runCodingAgentCliControlWithBootstrap(bootstrap)) return;

	if (parsed.mode !== "rpc") await prepareCodingAgentPipedStdin(parsed);

	if (parsed.mode === "rpc" && parsed.fileArgs.length > 0) {
		console.error(chalk.red("Error: @file arguments are not supported in RPC mode"));
		process.exit(1);
	}

	const printInvocation =
		parsed.mode === "rpc"
			? undefined
			: await prepareCodingAgentPrintInvocation({
					parsed,
					autoResizeImages: settingsManager.getImageAutoResize(),
					stdinPrepared: true,
				});
	const isInteractive = printInvocation?.kind === "interactive-unsupported";
	const mode = parsed.mode || "text";

	// 交互式终端模式已移除（不再随包发布 TUI 产品）。仅保留 print / rpc。
	if (isInteractive) {
		console.error(chalk.red("交互式终端模式已移除。请使用 --print 进行单次执行，或使用 Vetta 桌面应用。"));
		process.exit(1);
	}

	let scopedModels: ScopedModel[] = [];
	const modelPatterns = parsed.models ?? settingsManager.getEnabledModels();
	if (modelPatterns && modelPatterns.length > 0) {
		scopedModels = await resolveModelScope(modelPatterns, modelRegistry);
	}

	/**
	 * In RPC mode the parent process expects either a stream of JSON events or
	 * a single JSON error response — never a stack trace on stderr. Convert any
	 * startup-time SessionLockError into a structured response and exit cleanly
	 * so the host (e.g. an IM gateway orchestrator) can react.
	 */
	const failRpcStartupOnLock = (err: unknown): never => {
		if (mode === "rpc" && err instanceof SessionLockError) {
			process.stdout.write(
				`${JSON.stringify({
					type: "response",
					command: "startup",
					success: false,
					error: err.message,
					lockHolder: err.holder,
				})}\n`,
			);
			process.exit(2);
		}
		throw err;
	};

	// Create session manager based on CLI flags
	let sessionManager: SessionManager | undefined;
	try {
		sessionManager = await createSessionManager(parsed, cwd);
	} catch (err) {
		failRpcStartupOnLock(err);
	}

	// Handle --resume: 交互式会话选择器已随 TUI 移除。
	if (parsed.resume) {
		console.error(
			chalk.red("--resume 的交互式会话选择已移除。请用 --continue 继续最近会话，或用 --session-dir 指定目录。"),
		);
		process.exit(1);
	}

	const { options: sessionOptions, cliThinkingFromModel } = buildSessionOptions(
		parsed,
		scopedModels,
		sessionManager,
		modelRegistry,
		settingsManager,
	);
	sessionOptions.authStorage = authStorage;
	sessionOptions.modelRegistry = modelRegistry;
	sessionOptions.resourceLoader = resourceLoader;
	// memory-mode (ADR-0009): honored only with an explicit MEMORY.md path or the
	// --memory-mode switch, AND only in rpc mode. The entire memory system (tool,
	// MEMORY.md injection, rollover, dated work log) is designed for the im-gateway
	// RPC host driving the Claw conversation — it is the sole caller that passes
	// these flags. Requiring rpc mode is defense-in-depth: it keeps the whole
	// subsystem inert for desktop / TUI / CLI / other projects even if the flag
	// were ever passed there by accident, so the memory tool is never registered
	// outside Claw. See system-prompt.ts / rpc-mode.ts gates.
	sessionOptions.memoryMode = mode === "rpc" && (parsed.memoryMode || parsed.memoryFile !== undefined);
	sessionOptions.memoryFile = parsed.memoryFile;

	// Handle CLI --api-key as runtime override (not persisted)
	if (parsed.apiKey) {
		if (!sessionOptions.model) {
			console.error(
				chalk.red("--api-key requires a model to be specified via --model, --provider/--model, or --models"),
			);
			process.exit(1);
		}
		authStorage.setRuntimeApiKey(sessionOptions.model.provider, parsed.apiKey);
	}

	let session: Awaited<ReturnType<typeof createAgentSession>>["session"];
	try {
		({ session } = await createAgentSession(sessionOptions));
	} catch (err) {
		failRpcStartupOnLock(err);
		throw err; // unreachable: failRpcStartupOnLock either throws or exits
	}

	if (!isInteractive && !session.model) {
		console.error(chalk.red("No models available."));
		console.error(chalk.yellow("\nSet an API key environment variable:"));
		console.error("  ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, etc.");
		console.error(chalk.yellow(`\nOr create ${getModelsPath()}`));
		process.exit(1);
	}

	// Clamp thinking level to model capabilities for CLI-provided thinking levels.
	// This covers both --thinking <level> and --model <pattern>:<thinking>.
	const cliThinkingOverride = parsed.thinking !== undefined || cliThinkingFromModel;
	if (session.model && cliThinkingOverride) {
		let effectiveThinking = session.thinkingLevel;
		if (!session.model.reasoning) {
			effectiveThinking = "off";
		} else if (effectiveThinking === "xhigh" && !supportsXhigh(session.model)) {
			effectiveThinking = "high";
		}
		if (effectiveThinking !== session.thinkingLevel) {
			session.setThinkingLevel(effectiveThinking);
		}
	}

	if (mode === "rpc") {
		await runRpcMode(session, {
			enableHostBridge: parsed.enableHostBridge,
			runtimeDecision: options.rpcRuntimeDecision,
		});
	} else {
		if (!printInvocation || printInvocation.kind !== "print") {
			throw new Error("Print invocation was not prepared");
		}
		await runPrintMode(new LegacyPrintSessionAdapter(session), printInvocation.options);
		if (process.stdout.writableLength > 0) {
			await new Promise<void>((resolve) => process.stdout.once("drain", resolve));
		}
		process.exit(0);
	}
}
