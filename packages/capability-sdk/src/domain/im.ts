import { CAPABILITY_ERROR_CODES, CAPABILITY_LAYERS, CapabilityError, defineCapability } from "../contracts.js";
import {
	parseEmptyInput,
	parseInputRecord,
	parseOptionalInputString,
	parseOptionalOutputNumber,
	parseOptionalOutputString,
	parseOutputRecord,
	parseRequiredInputBoolean,
	parseRequiredInputString,
	parseRequiredOutputBoolean,
	parseRequiredOutputNumber,
	parseRequiredOutputString,
} from "./parse-helpers.js";

export const IM_TRANSPORTS = {
	FEISHU: "feishu",
	WECHAT: "wechat",
} as const;

export const IM_TRANSPORT_STATUSES = {
	OFFLINE: "offline",
	CONNECTING: "connecting",
	ONLINE: "online",
	ERROR: "error",
	AWAITING_BIND: "awaiting_bind",
} as const;

export const IM_LOG_LEVELS = {
	DEBUG: "debug",
	INFO: "info",
	WARN: "warn",
	ERROR: "error",
} as const;

export type ImTransport = (typeof IM_TRANSPORTS)[keyof typeof IM_TRANSPORTS];
export type ImTransportStatus = (typeof IM_TRANSPORT_STATUSES)[keyof typeof IM_TRANSPORT_STATUSES];
export type ImLogLevel = (typeof IM_LOG_LEVELS)[keyof typeof IM_LOG_LEVELS];

export interface ImAgentModel {
	readonly provider: string;
	readonly model: string;
	readonly reasoningLevel?: string;
}

export interface ImRuntimeStatus {
	readonly transport: ImTransportStatus;
	readonly lastError?: string;
	readonly lastErrorAt?: string;
	readonly activeSessions: number;
	readonly sidecarPid?: number;
	readonly sidecarStartedAt?: string;
	readonly consecutiveStartFailures: number;
	readonly binaryPath?: string;
}

export interface ImStatusSnapshot {
	readonly enabled: boolean;
	readonly transport: ImTransport;
	readonly agentModel: ImAgentModel | null;
	readonly wechatBound: boolean;
	readonly feishuAppId: string | null;
	readonly runtime: ImRuntimeStatus;
}

export interface ImLogEntry {
	readonly level: ImLogLevel;
	readonly msg: string;
	readonly time: string;
	readonly fields?: Record<string, unknown>;
}

export interface ImLogListInput {
	readonly limit: number;
}

export interface ImEnabledInput {
	readonly enabled: boolean;
}

export interface ImAgentModelSettingInput {
	readonly agentModel: ImAgentModel | null;
}

function parseEnumOutput<T extends string>(value: unknown, values: readonly T[], field: string): T {
	if (typeof value !== "string" || !values.includes(value as T)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, `Capability output ${field} is invalid`);
	}
	return value as T;
}

function parseImAgentModelOutput(value: unknown): ImAgentModel {
	const model = parseOutputRecord(value);
	const reasoningLevel = parseOptionalOutputString(model, "reasoningLevel");
	return {
		provider: parseRequiredOutputString(model, "provider"),
		model: parseRequiredOutputString(model, "model"),
		...(reasoningLevel === undefined ? {} : { reasoningLevel }),
	};
}

function parseImRuntimeStatus(value: unknown): ImRuntimeStatus {
	const status = parseOutputRecord(value);
	const lastError = parseOptionalOutputString(status, "lastError");
	const lastErrorAt = parseOptionalOutputString(status, "lastErrorAt");
	const sidecarPid = parseOptionalOutputNumber(status, "sidecarPid");
	const sidecarStartedAt = parseOptionalOutputString(status, "sidecarStartedAt");
	const binaryPath = parseOptionalOutputString(status, "binaryPath");
	return {
		transport: parseEnumOutput(status.transport, Object.values(IM_TRANSPORT_STATUSES), "transport"),
		...(lastError === undefined ? {} : { lastError }),
		...(lastErrorAt === undefined ? {} : { lastErrorAt }),
		activeSessions: parseRequiredOutputNumber(status, "activeSessions"),
		...(sidecarPid === undefined ? {} : { sidecarPid }),
		...(sidecarStartedAt === undefined ? {} : { sidecarStartedAt }),
		consecutiveStartFailures: parseRequiredOutputNumber(status, "consecutiveStartFailures"),
		...(binaryPath === undefined ? {} : { binaryPath }),
	};
}

function parseImStatusSnapshot(value: unknown): ImStatusSnapshot {
	const status = parseOutputRecord(value);
	const agentModel = status.agentModel === null ? null : parseImAgentModelOutput(status.agentModel);
	const feishuAppId = status.feishuAppId;
	if (feishuAppId !== null && typeof feishuAppId !== "string") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output feishuAppId is invalid");
	}
	return {
		enabled: parseRequiredOutputBoolean(status, "enabled"),
		transport: parseEnumOutput(status.transport, Object.values(IM_TRANSPORTS), "transport"),
		agentModel,
		wechatBound: parseRequiredOutputBoolean(status, "wechatBound"),
		feishuAppId,
		runtime: parseImRuntimeStatus(status.runtime),
	};
}

function parseImLogEntry(value: unknown): ImLogEntry {
	const log = parseOutputRecord(value);
	const fields = log.fields === undefined ? undefined : parseOutputRecord(log.fields);
	return {
		level: parseEnumOutput(log.level, Object.values(IM_LOG_LEVELS), "level"),
		msg: parseRequiredOutputString(log, "msg"),
		time: parseRequiredOutputString(log, "time"),
		...(fields === undefined ? {} : { fields: { ...fields } }),
	};
}

function parseImLogs(value: unknown): ImLogEntry[] {
	if (!Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an array");
	}
	return value.map(parseImLogEntry);
}

function parseImLogListInput(value: unknown): ImLogListInput {
	const input = parseInputRecord(value);
	const limit = input.limit;
	if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 0) {
		throw new CapabilityError(
			CAPABILITY_ERROR_CODES.INVALID_INPUT,
			"Capability field limit must be a non-negative integer",
		);
	}
	return { limit };
}

function parseImEnabledInput(value: unknown): ImEnabledInput {
	const input = parseInputRecord(value);
	return { enabled: parseRequiredInputBoolean(input, "enabled") };
}

function parseImAgentModelInput(value: unknown): ImAgentModelSettingInput {
	const input = parseInputRecord(value);
	if (input.agentModel === null) return { agentModel: null };
	const model = parseInputRecord(input.agentModel);
	const reasoningLevel = parseOptionalInputString(model, "reasoningLevel");
	return {
		agentModel: {
			provider: parseRequiredInputString(model, "provider"),
			model: parseRequiredInputString(model, "model"),
			...(reasoningLevel === undefined ? {} : { reasoningLevel }),
		},
	};
}

export const DOMAIN_IM_CAPABILITIES = {
	GET_STATUS: defineCapability<Record<string, never>, ImStatusSnapshot>({
		id: "cap.domain.vetta.im.status.get",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseImStatusSnapshot,
	}),
	LIST_LOGS: defineCapability<ImLogListInput, ImLogEntry[]>({
		id: "cap.domain.vetta.im.log.list",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseImLogListInput,
		parseOutput: parseImLogs,
	}),
	SET_ENABLED: defineCapability<ImEnabledInput, ImRuntimeStatus>({
		id: "cap.domain.vetta.im.enabled.set",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseImEnabledInput,
		parseOutput: parseImRuntimeStatus,
	}),
	RESTART: defineCapability<Record<string, never>, ImRuntimeStatus>({
		id: "cap.domain.vetta.im.restart",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseImRuntimeStatus,
	}),
	SET_AGENT_MODEL: defineCapability<ImAgentModelSettingInput, ImRuntimeStatus>({
		id: "cap.domain.vetta.im.agent-model.set",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseImAgentModelInput,
		parseOutput: parseImRuntimeStatus,
	}),
} as const;
