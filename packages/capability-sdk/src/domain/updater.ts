import { CAPABILITY_ERROR_CODES, CAPABILITY_LAYERS, CapabilityError, defineCapability } from "../contracts.js";
import {
	parseEmptyInput,
	parseOptionalOutputNumber,
	parseOptionalOutputString,
	parseOutputRecord,
	parseRequiredOutputBoolean,
	parseRequiredOutputString,
	parseVoidOutput,
} from "./parse-helpers.js";

export const UPDATER_PHASES = {
	IDLE: "idle",
	CHECKING: "checking",
	AVAILABLE: "available",
	DOWNLOADING: "downloading",
	READY: "ready",
	INSTALLING: "installing",
	ERROR: "error",
} as const;

export type UpdaterPhase = (typeof UPDATER_PHASES)[keyof typeof UPDATER_PHASES];

export interface UpdaterState {
	readonly phase: UpdaterPhase;
	readonly currentVersion: string;
	readonly latestVersion?: string;
	readonly releaseNote?: string;
	readonly progress?: number;
	readonly downloadedBytes?: number;
	readonly totalBytes?: number;
	readonly assetFileName?: string;
	readonly error?: string;
	readonly pendingInstall: boolean;
}

function parseUpdaterState(value: unknown): UpdaterState {
	const state = parseOutputRecord(value);
	const phase = state.phase;
	if (typeof phase !== "string" || !Object.values(UPDATER_PHASES).includes(phase as UpdaterPhase)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output phase is invalid");
	}
	const latestVersion = parseOptionalOutputString(state, "latestVersion");
	const releaseNote = parseOptionalOutputString(state, "releaseNote");
	const progress = parseOptionalOutputNumber(state, "progress");
	const downloadedBytes = parseOptionalOutputNumber(state, "downloadedBytes");
	const totalBytes = parseOptionalOutputNumber(state, "totalBytes");
	const assetFileName = parseOptionalOutputString(state, "assetFileName");
	const error = parseOptionalOutputString(state, "error");
	if (progress !== undefined && (progress < 0 || progress > 1)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output progress is invalid");
	}
	if (downloadedBytes !== undefined && downloadedBytes < 0) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output downloadedBytes is invalid");
	}
	if (totalBytes !== undefined && totalBytes < 0) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output totalBytes is invalid");
	}
	return {
		phase: phase as UpdaterPhase,
		currentVersion: parseRequiredOutputString(state, "currentVersion"),
		...(latestVersion === undefined ? {} : { latestVersion }),
		...(releaseNote === undefined ? {} : { releaseNote }),
		...(progress === undefined ? {} : { progress }),
		...(downloadedBytes === undefined ? {} : { downloadedBytes }),
		...(totalBytes === undefined ? {} : { totalBytes }),
		...(assetFileName === undefined ? {} : { assetFileName }),
		...(error === undefined ? {} : { error }),
		pendingInstall: parseRequiredOutputBoolean(state, "pendingInstall"),
	};
}

function parseVersion(value: unknown): string {
	return parseRequiredOutputString({ version: value }, "version");
}

export const DOMAIN_UPDATER_CAPABILITIES = {
	GET_STATE: defineCapability<Record<string, never>, UpdaterState>({
		id: "cap.domain.vetta.updater.state.get",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseUpdaterState,
	}),
	GET_CURRENT_VERSION: defineCapability<Record<string, never>, string>({
		id: "cap.domain.vetta.updater.current-version.get",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseVersion,
	}),
	CHECK: defineCapability<Record<string, never>, UpdaterState>({
		id: "cap.domain.vetta.updater.check",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseUpdaterState,
	}),
	DOWNLOAD: defineCapability<Record<string, never>, UpdaterState>({
		id: "cap.domain.vetta.updater.download",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseUpdaterState,
	}),
	INSTALL: defineCapability<Record<string, never>, undefined>({
		id: "cap.domain.vetta.updater.install",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseVoidOutput,
	}),
	DISMISS: defineCapability<Record<string, never>, undefined>({
		id: "cap.domain.vetta.updater.dismiss",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseVoidOutput,
	}),
	CANCEL: defineCapability<Record<string, never>, undefined>({
		id: "cap.domain.vetta.updater.cancel",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseVoidOutput,
	}),
} as const;
