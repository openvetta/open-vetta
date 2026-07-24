import { CAPABILITY_ERROR_CODES, CAPABILITY_LAYERS, CapabilityError, defineCapability } from "../contracts.js";
import {
	parseEmptyInput,
	parseInputRecord,
	parseOptionalOutputNumber,
	parseOptionalOutputString,
	parseOutputRecord,
	parseRequiredInputBoolean,
	parseRequiredInputString,
	parseRequiredOutputBoolean,
	parseRequiredOutputString,
} from "./parse-helpers.js";

export const GENERAL_EXECUTION_MODES = {
	SANDBOX: "sandbox",
	FULL_ACCESS: "full-access",
} as const;

export const SANDBOX_STATUSES = {
	UNKNOWN: "unknown",
	AVAILABLE: "available",
	UNAVAILABLE: "unavailable",
} as const;

export const SANDBOX_BACKENDS = {
	BUNDLED_BWRAP: "bundled-bwrap",
	SYSTEM_BWRAP: "system-bwrap",
	MACOS_SEATBELT: "macos-seatbelt",
	WINDOWS_HOST: "windows-host",
} as const;

export type GeneralExecutionMode = (typeof GENERAL_EXECUTION_MODES)[keyof typeof GENERAL_EXECUTION_MODES];
export type SandboxStatus = (typeof SANDBOX_STATUSES)[keyof typeof SANDBOX_STATUSES];
export type SandboxBackend = (typeof SANDBOX_BACKENDS)[keyof typeof SANDBOX_BACKENDS] | null;

export interface SandboxFeatures {
	readonly readRoots: boolean;
	readonly writeRoots: boolean;
	readonly denyRead: boolean;
	readonly denyWrite: boolean;
	readonly tempRootIsolation: boolean;
	readonly networkIsolation: boolean;
	readonly processTreeKill: boolean;
	readonly passiveProbe: boolean;
	readonly activeProbe: boolean;
}

export interface SandboxCapabilitySnapshot {
	readonly status: SandboxStatus;
	readonly backend: SandboxBackend;
	readonly platform: string;
	readonly binaryPath?: string;
	readonly reason?: string;
	readonly details?: string;
	readonly checkedAt?: number;
	readonly features?: SandboxFeatures;
}

export interface GeneralSettingsSnapshot {
	readonly workspacePath: string;
	readonly defaultExecutionMode: GeneralExecutionMode;
	readonly notificationsEnabled: boolean;
	readonly debugMode: boolean;
	readonly sandbox: SandboxCapabilitySnapshot;
}

export interface NotificationsSettingInput {
	readonly enabled: boolean;
}

export interface DefaultExecutionModeSettingInput {
	readonly mode: GeneralExecutionMode;
}

export interface WorkspaceSettingInput {
	readonly path: string;
}

function parseEnum<Value extends string>(
	value: unknown,
	values: readonly Value[],
	field: string,
	code: typeof CAPABILITY_ERROR_CODES.INVALID_INPUT | typeof CAPABILITY_ERROR_CODES.INVALID_OUTPUT,
): Value {
	if (typeof value !== "string" || !values.includes(value as Value)) {
		throw new CapabilityError(code, `Capability ${field} is invalid`);
	}
	return value as Value;
}

function parseSandboxFeatures(value: unknown): SandboxFeatures {
	const features = parseOutputRecord(value);
	return {
		readRoots: parseRequiredOutputBoolean(features, "readRoots"),
		writeRoots: parseRequiredOutputBoolean(features, "writeRoots"),
		denyRead: parseRequiredOutputBoolean(features, "denyRead"),
		denyWrite: parseRequiredOutputBoolean(features, "denyWrite"),
		tempRootIsolation: parseRequiredOutputBoolean(features, "tempRootIsolation"),
		networkIsolation: parseRequiredOutputBoolean(features, "networkIsolation"),
		processTreeKill: parseRequiredOutputBoolean(features, "processTreeKill"),
		passiveProbe: parseRequiredOutputBoolean(features, "passiveProbe"),
		activeProbe: parseRequiredOutputBoolean(features, "activeProbe"),
	};
}

function parseSandboxCapability(value: unknown): SandboxCapabilitySnapshot {
	const sandbox = parseOutputRecord(value);
	const backend =
		sandbox.backend === null
			? null
			: parseEnum(
					sandbox.backend,
					Object.values(SANDBOX_BACKENDS),
					"output sandbox.backend",
					CAPABILITY_ERROR_CODES.INVALID_OUTPUT,
				);
	const features = sandbox.features === undefined ? undefined : parseSandboxFeatures(sandbox.features);
	const binaryPath = parseOptionalOutputString(sandbox, "binaryPath");
	const reason = parseOptionalOutputString(sandbox, "reason");
	const details = parseOptionalOutputString(sandbox, "details");
	const checkedAt = parseOptionalOutputNumber(sandbox, "checkedAt");
	return {
		status: parseEnum(
			sandbox.status,
			Object.values(SANDBOX_STATUSES),
			"output sandbox.status",
			CAPABILITY_ERROR_CODES.INVALID_OUTPUT,
		),
		backend,
		platform: parseRequiredOutputString(sandbox, "platform"),
		...(binaryPath === undefined ? {} : { binaryPath }),
		...(reason === undefined ? {} : { reason }),
		...(details === undefined ? {} : { details }),
		...(checkedAt === undefined ? {} : { checkedAt }),
		...(features === undefined ? {} : { features }),
	};
}

function parseGeneralSettingsSnapshot(value: unknown): GeneralSettingsSnapshot {
	const settings = parseOutputRecord(value);
	return {
		workspacePath: parseRequiredOutputString(settings, "workspacePath"),
		defaultExecutionMode: parseEnum(
			settings.defaultExecutionMode,
			Object.values(GENERAL_EXECUTION_MODES),
			"output defaultExecutionMode",
			CAPABILITY_ERROR_CODES.INVALID_OUTPUT,
		),
		notificationsEnabled: parseRequiredOutputBoolean(settings, "notificationsEnabled"),
		debugMode: parseRequiredOutputBoolean(settings, "debugMode"),
		sandbox: parseSandboxCapability(settings.sandbox),
	};
}

function parseNotificationsSetting(value: unknown): NotificationsSettingInput {
	const input = parseInputRecord(value);
	return { enabled: parseRequiredInputBoolean(input, "enabled") };
}

function parseNotificationsSettingOutput(value: unknown): NotificationsSettingInput {
	const output = parseOutputRecord(value);
	return { enabled: parseRequiredOutputBoolean(output, "enabled") };
}

function parseDefaultExecutionModeSetting(value: unknown): DefaultExecutionModeSettingInput {
	const input = parseInputRecord(value);
	return {
		mode: parseEnum(
			input.mode,
			Object.values(GENERAL_EXECUTION_MODES),
			"field mode",
			CAPABILITY_ERROR_CODES.INVALID_INPUT,
		),
	};
}

function parseDefaultExecutionModeSettingOutput(value: unknown): DefaultExecutionModeSettingInput {
	const output = parseOutputRecord(value);
	return {
		mode: parseEnum(
			output.mode,
			Object.values(GENERAL_EXECUTION_MODES),
			"output mode",
			CAPABILITY_ERROR_CODES.INVALID_OUTPUT,
		),
	};
}

function parseWorkspaceSetting(value: unknown): WorkspaceSettingInput {
	const input = parseInputRecord(value);
	return { path: parseRequiredInputString(input, "path") };
}

function parseWorkspaceSettingOutput(value: unknown): WorkspaceSettingInput {
	const output = parseOutputRecord(value);
	return { path: parseRequiredOutputString(output, "path") };
}

export const DOMAIN_GENERAL_SETTINGS_CAPABILITIES = {
	GET: defineCapability<Record<string, never>, GeneralSettingsSnapshot>({
		id: "cap.domain.vetta.general-settings.get",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseGeneralSettingsSnapshot,
	}),
	SET_NOTIFICATIONS: defineCapability<NotificationsSettingInput, NotificationsSettingInput>({
		id: "cap.domain.vetta.general-settings.notifications.set",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseNotificationsSetting,
		parseOutput: parseNotificationsSettingOutput,
	}),
	SET_DEFAULT_EXECUTION_MODE: defineCapability<DefaultExecutionModeSettingInput, DefaultExecutionModeSettingInput>({
		id: "cap.domain.vetta.general-settings.default-execution-mode.set",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseDefaultExecutionModeSetting,
		parseOutput: parseDefaultExecutionModeSettingOutput,
	}),
	SET_WORKSPACE: defineCapability<WorkspaceSettingInput, WorkspaceSettingInput>({
		id: "cap.domain.vetta.general-settings.workspace.set",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseWorkspaceSetting,
		parseOutput: parseWorkspaceSettingOutput,
	}),
} as const;
