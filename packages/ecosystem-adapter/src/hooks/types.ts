export const HOOK_EVENT_NAMES = [
	"SessionStart",
	"UserPromptSubmit",
	"PreToolUse",
	"PermissionRequest",
	"PostToolUse",
	"PreCompact",
	"PostCompact",
	"SubagentStart",
	"SubagentStop",
	"Stop",
] as const;

export type HookEventName = (typeof HOOK_EVENT_NAMES)[number];
export type HookPermissionMode = "default" | "acceptEdits" | "plan" | "dontAsk" | "bypassPermissions";
export type SessionStartSource = "startup" | "resume" | "clear" | "compact";
export type CompactionTrigger = "manual" | "auto";
export type HookRunStatus = "Running" | "Completed" | "Failed" | "Blocked" | "Stopped";
export type HookOutputEntryKind = "Warning" | "Stop" | "Feedback" | "Context" | "Error";

export interface HookConfigLayer {
	directory: string;
	enabled: boolean;
	label?: string;
	sources?: readonly HookConfigSource[];
}

export interface HookConfigSource {
	path: string;
	env?: Readonly<Record<string, string>>;
	pluginId?: string;
}

export interface HookDiagnostic {
	code:
		| "config_read_failed"
		| "config_parse_failed"
		| "invalid_matcher"
		| "invalid_handler"
		| "unsupported_handler_type"
		| "unsupported_handler_mode"
		| "untrusted_handler";
	message: string;
	sourcePath: string;
}

export interface ConfiguredHookHandler {
	eventName: HookEventName;
	matcher?: string;
	command: string;
	timeoutMs: number;
	statusMessage?: string;
	sourcePath: string;
	displayOrder: number;
	env?: Readonly<Record<string, string>>;
	pluginId?: string;
}

export interface SubagentHookContext {
	agentId: string;
	agentType: string;
}

export interface HookToolIdentity {
	name: string;
	matcherAliases: readonly string[];
}

interface HookRequestBase {
	sessionId: string;
	turnId?: string;
	cwd: string;
	transcriptPath: string | null;
	model: string;
	permissionMode: HookPermissionMode;
}

export interface SessionStartHookRequest extends HookRequestBase {
	eventName: "SessionStart";
	source: SessionStartSource;
}

export interface UserPromptSubmitHookRequest extends HookRequestBase {
	eventName: "UserPromptSubmit";
	turnId: string;
	prompt: string;
	subagent?: SubagentHookContext;
}

export interface PreToolUseHookRequest extends HookRequestBase {
	eventName: "PreToolUse";
	turnId: string;
	tool: HookToolIdentity;
	toolUseId: string;
	toolInput: unknown;
	subagent?: SubagentHookContext;
}

export interface PermissionRequestHookRequest extends HookRequestBase {
	eventName: "PermissionRequest";
	turnId: string;
	tool: HookToolIdentity;
	toolInput: unknown;
	runIdSuffix: string;
	subagent?: SubagentHookContext;
}

export interface PostToolUseHookRequest extends HookRequestBase {
	eventName: "PostToolUse";
	turnId: string;
	tool: HookToolIdentity;
	toolUseId: string;
	toolInput: unknown;
	toolResponse: unknown;
	subagent?: SubagentHookContext;
}

export interface CompactHookRequest extends HookRequestBase {
	eventName: "PreCompact" | "PostCompact";
	turnId: string;
	trigger: CompactionTrigger;
	subagent?: SubagentHookContext;
}

export interface SubagentStartHookRequest extends HookRequestBase, SubagentHookContext {
	eventName: "SubagentStart";
	turnId: string;
}

export interface SubagentStopHookRequest extends HookRequestBase, SubagentHookContext {
	eventName: "SubagentStop";
	turnId: string;
	stopHookActive: boolean;
	lastAssistantMessage: string | null;
	agentTranscriptPath: string | null;
}

export interface StopHookRequest extends HookRequestBase {
	eventName: "Stop";
	turnId: string;
	stopHookActive: boolean;
	lastAssistantMessage: string | null;
}

export type HookRequest =
	| SessionStartHookRequest
	| UserPromptSubmitHookRequest
	| PreToolUseHookRequest
	| PermissionRequestHookRequest
	| PostToolUseHookRequest
	| CompactHookRequest
	| SubagentStartHookRequest
	| SubagentStopHookRequest
	| StopHookRequest;

export interface HookCommandExecutionRequest {
	command: string;
	cwd: string;
	stdin: string;
	timeoutMs: number;
	env?: Readonly<Record<string, string>>;
}

export interface HookCommandError {
	code: "spawn_failed" | "timed_out" | "cancelled" | "output_limit";
	message: string;
}

export interface HookCommandResult {
	startedAt: number;
	completedAt: number;
	durationMs: number;
	completionOrder?: number;
	exitCode: number | null;
	stdout: string;
	stderr: string;
	error?: HookCommandError;
}

export interface HookOutputEntry {
	kind: HookOutputEntryKind;
	text: string;
}

export interface HookRunSummary {
	id: string;
	profileId: string;
	eventName: HookEventName;
	handlerType: "command";
	executionMode: "sync";
	scope: "session" | "turn";
	sourcePath: string;
	displayOrder: number;
	status: HookRunStatus;
	statusMessage?: string;
	startedAt: number;
	completedAt?: number;
	durationMs?: number;
	entries: HookOutputEntry[];
}

export interface HookHandlerOutcome {
	completionOrder?: number;
	status: Exclude<HookRunStatus, "Running">;
	entries: HookOutputEntry[];
	shouldStop: boolean;
	stopReason?: string;
	shouldBlock: boolean;
	blockReason?: string;
	additionalContexts: string[];
	feedbackMessages: string[];
	continuationFragments: string[];
	updatedToolInput?: unknown;
	permissionDecision?: "allow" | "deny";
	permissionMessage?: string;
}

export interface HookDispatchEffect {
	shouldStop: boolean;
	stopReason?: string;
	shouldBlock: boolean;
	blockReason?: string;
	additionalContexts: string[];
	feedbackMessage?: string;
	continuationFragments: string[];
	updatedToolInput?: unknown;
	permissionDecision?: "allow" | "deny";
	permissionMessage?: string;
}

export interface HookDispatchOutcome extends HookDispatchEffect {
	runs: HookRunSummary[];
}

export interface HookCompatibilityProfile {
	readonly id: string;
	encodeInput(request: HookRequest): string;
	interpretResult(request: HookRequest, result: HookCommandResult): HookHandlerOutcome;
	aggregate(request: HookRequest, outcomes: readonly HookHandlerOutcome[]): HookDispatchEffect;
	matches(request: HookRequest, matcher: string | undefined): boolean;
}

export interface HookCommandExecutor {
	execute(request: HookCommandExecutionRequest, signal?: AbortSignal): Promise<HookCommandResult>;
}

export interface HookObserver {
	onRunStarted?(summary: HookRunSummary): void;
	onRunCompleted?(summary: HookRunSummary): void;
}
