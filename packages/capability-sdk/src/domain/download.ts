import { CAPABILITY_ERROR_CODES, CAPABILITY_LAYERS, CapabilityError, defineCapability } from "../contracts.js";
import {
	parseEmptyInput,
	parseInputRecord,
	parseOptionalOutputNumber,
	parseOptionalOutputString,
	parseOutputRecord,
	parseRequiredInputString,
	parseRequiredOutputNumber,
	parseRequiredOutputString,
	parseVoidOutput,
} from "./parse-helpers.js";

export const DOWNLOAD_STATUSES = {
	QUEUED: "queued",
	DOWNLOADING: "downloading",
	PAUSED: "paused",
	COMPLETED: "completed",
	FAILED: "failed",
	CANCELED: "canceled",
} as const;

export type DownloadStatus = (typeof DOWNLOAD_STATUSES)[keyof typeof DOWNLOAD_STATUSES];

export interface DownloadItem {
	readonly id: string;
	readonly url: string;
	readonly filename: string;
	readonly path: string;
	readonly totalBytes: number;
	readonly receivedBytes: number;
	readonly status: DownloadStatus;
	readonly error?: string;
	readonly createdAt: number;
	readonly completedAt?: number;
	readonly speedBytesPerSec?: number;
}

export interface DownloadCancelInput {
	readonly id: string;
}

function parseDownloadItem(value: unknown): DownloadItem {
	const item = parseOutputRecord(value);
	const status = item.status;
	if (typeof status !== "string" || !Object.values(DOWNLOAD_STATUSES).includes(status as DownloadStatus)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output status is invalid");
	}
	const error = parseOptionalOutputString(item, "error");
	const completedAt = parseOptionalOutputNumber(item, "completedAt");
	const speedBytesPerSec = parseOptionalOutputNumber(item, "speedBytesPerSec");
	return {
		id: parseRequiredOutputString(item, "id"),
		url: parseRequiredOutputString(item, "url"),
		filename: parseRequiredOutputString(item, "filename"),
		path: parseRequiredOutputString(item, "path"),
		totalBytes: parseRequiredOutputNumber(item, "totalBytes"),
		receivedBytes: parseRequiredOutputNumber(item, "receivedBytes"),
		status: status as DownloadStatus,
		...(error === undefined ? {} : { error }),
		createdAt: parseRequiredOutputNumber(item, "createdAt"),
		...(completedAt === undefined ? {} : { completedAt }),
		...(speedBytesPerSec === undefined ? {} : { speedBytesPerSec }),
	};
}

function parseDownloadItems(value: unknown): DownloadItem[] {
	if (!Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an array");
	}
	return value.map(parseDownloadItem);
}

function parseDownloadCancelInput(value: unknown): DownloadCancelInput {
	const input = parseInputRecord(value);
	return { id: parseRequiredInputString(input, "id") };
}

export const DOMAIN_DOWNLOAD_CAPABILITIES = {
	LIST: defineCapability<Record<string, never>, DownloadItem[]>({
		id: "cap.domain.vetta.download.list",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseDownloadItems,
	}),
	CANCEL: defineCapability<DownloadCancelInput, undefined>({
		id: "cap.domain.vetta.download.cancel",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseDownloadCancelInput,
		parseOutput: parseVoidOutput,
	}),
} as const;
