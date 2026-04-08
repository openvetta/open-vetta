/**
 * TypeScript counterpart of vetta-im-gateway/internal/hostproto.
 *
 * Defines the NDJSON frames exchanged with the im-gateway sidecar over its
 * stdin/stdout pipes. Frames flowing parent → child are written to the
 * sidecar's stdin; frames flowing child → parent are read from stdout.
 *
 * Keep this file in lockstep with frames.go in the Go package — drift will
 * cause silent JSON misinterpretation.
 */

// =============================================================================
// Frame type discriminators (must match Go constants exactly)
// =============================================================================

export const FRAME_INIT = "init" as const;
export const FRAME_CONFIG_UPDATE = "config_update" as const;
export const FRAME_PROJECTS_UPDATE = "projects_update" as const;
export const FRAME_SHUTDOWN = "shutdown" as const;

export const EVENT_READY = "ready" as const;
export const EVENT_LOG = "log" as const;
export const EVENT_STATUS = "status" as const;
export const EVENT_STATE_PATCH = "state_patch" as const;
export const EVENT_METRIC = "metric" as const;

// =============================================================================
// Shared payload types
// =============================================================================

export interface FeishuConfig {
	appId: string;
	appSecret: string;
	verificationToken?: string;
	encryptKey?: string;
	baseUrl?: string;
}

export interface ProjectEntry {
	id?: string;
	name?: string;
	path: string;
}

export interface SessionStateEntry {
	userId: string;
	projectId: string;
	sessionPath?: string;
	updatedAt?: string;
}

// =============================================================================
// Inbound frames (parent → child)
// =============================================================================

export interface InitFrame {
	type: typeof FRAME_INIT;
	feishu?: FeishuConfig;
	projects: ProjectEntry[];
	state: SessionStateEntry[];
	logLevel?: "debug" | "info" | "warn" | "error";
}

export interface ConfigUpdateFrame {
	type: typeof FRAME_CONFIG_UPDATE;
	feishu?: FeishuConfig;
}

export interface ProjectsUpdateFrame {
	type: typeof FRAME_PROJECTS_UPDATE;
	projects: ProjectEntry[];
}

export interface ShutdownFrame {
	type: typeof FRAME_SHUTDOWN;
}

export type InboundFrame = InitFrame | ConfigUpdateFrame | ProjectsUpdateFrame | ShutdownFrame;

// =============================================================================
// Outbound events (child → parent)
// =============================================================================

export type TransportStatus = "offline" | "connecting" | "online" | "error";

export interface ReadyEvent {
	type: typeof EVENT_READY;
	version: string;
	transport: string;
}

export interface LogEvent {
	type: typeof EVENT_LOG;
	level: "debug" | "info" | "warn" | "error";
	msg: string;
	fields?: Record<string, unknown>;
	time: string;
}

export interface StatusEvent {
	type: typeof EVENT_STATUS;
	transport: TransportStatus;
	lastError?: string;
	time: string;
}

export interface StatePatchEvent {
	type: typeof EVENT_STATE_PATCH;
	userId: string;
	projectId: string;
	sessionPath: string;
	updatedAt: string;
}

export interface MetricEvent {
	type: typeof EVENT_METRIC;
	name: string;
	value: number;
}

export type OutboundEvent = ReadyEvent | LogEvent | StatusEvent | StatePatchEvent | MetricEvent;

// =============================================================================
// Encode / decode helpers
// =============================================================================

/**
 * Serialize a frame for transmission. Returns a string ending with '\n' so it
 * can be written directly to a child's stdin.
 */
export function encodeFrame(frame: InboundFrame): string {
	return `${JSON.stringify(frame)}\n`;
}

/**
 * Parse a single NDJSON line from the child. Returns null for empty lines.
 * Throws on malformed JSON or missing/unknown discriminator.
 */
export function decodeEvent(line: string): OutboundEvent | null {
	const trimmed = line.trim();
	if (trimmed.length === 0) return null;
	const parsed = JSON.parse(trimmed) as { type?: string };
	if (!parsed || typeof parsed.type !== "string") {
		throw new Error(`hostproto: missing type in event: ${trimmed}`);
	}
	switch (parsed.type) {
		case EVENT_READY:
		case EVENT_LOG:
		case EVENT_STATUS:
		case EVENT_STATE_PATCH:
		case EVENT_METRIC:
			return parsed as OutboundEvent;
		default:
			throw new Error(`hostproto: unknown event type "${parsed.type}"`);
	}
}
