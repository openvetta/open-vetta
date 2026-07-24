import {
	CAPABILITY_ERROR_CODES,
	CAPABILITY_LAYERS,
	CAPABILITY_PREFIXES,
	CapabilityError,
	defineCapability,
} from "./contracts.js";

/** Stable prefix for Vetta-owned domain capabilities. Prefixes are never authorization rules. */
export const VETTA_DOMAIN_CAPABILITY_PREFIX = CAPABILITY_PREFIXES.VETTA_DOMAIN;

export interface ProjectEntry {
	readonly path: string;
	readonly name?: string;
}

export interface ProjectListResult {
	readonly workspacePath: string;
	readonly projects: readonly ProjectEntry[];
	readonly archivedProjects: readonly ProjectEntry[];
}

export interface ProjectCreateInput {
	readonly name: string;
	readonly path?: string;
}

export interface ProjectOpenInput {
	readonly path: string;
	readonly name?: string;
}

export interface ProjectRenameInput {
	readonly path: string;
	readonly name: string;
}

export interface ProjectPathInput {
	readonly path: string;
}

export interface SessionListInput {
	readonly cwd: string;
}

export interface SessionRuntimeProject {
	readonly cwd: string;
	readonly sessionCount: number;
}

export interface SessionHistoryEntry {
	readonly id: string;
	readonly path: string;
	readonly cwd: string;
	readonly name?: string;
	readonly firstMessage: string;
	readonly modifiedAt: number;
	readonly lastMessagePreview?: string;
	readonly parentSessionPath?: string;
	readonly parentEntryId?: string;
}

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

function parseInputRecord(value: unknown): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Capability input must be an object");
	}
	return value as Record<string, unknown>;
}

function parseOutputRecord(value: unknown): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an object");
	}
	return value as Record<string, unknown>;
}

function parseRequiredInputString(input: Record<string, unknown>, field: string): string {
	const value = input[field];
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, `Capability field ${field} must be a string`);
	}
	return value;
}

function parseOptionalInputString(input: Record<string, unknown>, field: string): string | undefined {
	const value = input[field];
	if (value === undefined) return undefined;
	return parseRequiredInputString(input, field);
}

function parseRequiredOutputString(input: Record<string, unknown>, field: string): string {
	const value = input[field];
	if (typeof value !== "string") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, `Capability output ${field} must be a string`);
	}
	return value;
}

function parseOptionalOutputString(input: Record<string, unknown>, field: string): string | undefined {
	const value = input[field];
	if (value === undefined) return undefined;
	return parseRequiredOutputString(input, field);
}

function parseRequiredOutputNumber(input: Record<string, unknown>, field: string): number {
	const value = input[field];
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, `Capability output ${field} must be a number`);
	}
	return value;
}

function parseOptionalOutputNumber(input: Record<string, unknown>, field: string): number | undefined {
	const value = input[field];
	if (value === undefined) return undefined;
	return parseRequiredOutputNumber(input, field);
}

function parseEmptyInput(value: unknown): Record<string, never> {
	const input = parseInputRecord(value);
	if (Object.keys(input).length > 0) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Capability input must be empty");
	}
	return {};
}

function parseProjectEntry(value: unknown): ProjectEntry {
	const entry = parseOutputRecord(value);
	const name = entry.name;
	if (name !== undefined && typeof name !== "string") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output name must be a string");
	}
	return {
		path: parseRequiredOutputString(entry, "path"),
		...(name === undefined ? {} : { name }),
	};
}

function parseProjectEntries(value: unknown): ProjectEntry[] {
	if (!Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an array");
	}
	return value.map(parseProjectEntry);
}

function parseProjectListResult(value: unknown): ProjectListResult {
	const result = parseOutputRecord(value);
	return {
		workspacePath: parseRequiredOutputString(result, "workspacePath"),
		projects: parseProjectEntries(result.projects),
		archivedProjects: parseProjectEntries(result.archivedProjects),
	};
}

function parseProjectCreateInput(value: unknown): ProjectCreateInput {
	const input = parseInputRecord(value);
	const path = parseOptionalInputString(input, "path");
	return {
		name: parseRequiredInputString(input, "name"),
		...(path === undefined ? {} : { path }),
	};
}

function parseProjectOpenInput(value: unknown): ProjectOpenInput {
	const input = parseInputRecord(value);
	const name = parseOptionalInputString(input, "name");
	return {
		path: parseRequiredInputString(input, "path"),
		...(name === undefined ? {} : { name }),
	};
}

function parseProjectRenameInput(value: unknown): ProjectRenameInput {
	const input = parseInputRecord(value);
	return {
		path: parseRequiredInputString(input, "path"),
		name: parseRequiredInputString(input, "name"),
	};
}

function parseProjectPathInput(value: unknown): ProjectPathInput {
	const input = parseInputRecord(value);
	return { path: parseRequiredInputString(input, "path") };
}

function parseVoidOutput(value: unknown): undefined {
	if (value !== undefined) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be undefined");
	}
	return undefined;
}

function parseSessionListInput(value: unknown): SessionListInput {
	const input = parseInputRecord(value);
	return { cwd: parseRequiredInputString(input, "cwd") };
}

function parseSessionRuntimeProject(value: unknown): SessionRuntimeProject {
	const project = parseOutputRecord(value);
	const sessionCount = parseRequiredOutputNumber(project, "sessionCount");
	if (!Number.isInteger(sessionCount) || sessionCount < 0) {
		throw new CapabilityError(
			CAPABILITY_ERROR_CODES.INVALID_OUTPUT,
			"Capability output sessionCount must be a non-negative integer",
		);
	}
	return {
		cwd: parseRequiredOutputString(project, "cwd"),
		sessionCount,
	};
}

function parseSessionRuntimeProjects(value: unknown): SessionRuntimeProject[] {
	if (!Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an array");
	}
	return value.map(parseSessionRuntimeProject);
}

function parseSessionHistoryEntry(value: unknown): SessionHistoryEntry {
	const entry = parseOutputRecord(value);
	const name = parseOptionalOutputString(entry, "name");
	const lastMessagePreview = parseOptionalOutputString(entry, "lastMessagePreview");
	const parentSessionPath = parseOptionalOutputString(entry, "parentSessionPath");
	const parentEntryId = parseOptionalOutputString(entry, "parentEntryId");
	return {
		id: parseRequiredOutputString(entry, "id"),
		path: parseRequiredOutputString(entry, "path"),
		cwd: parseRequiredOutputString(entry, "cwd"),
		...(name === undefined ? {} : { name }),
		firstMessage: parseRequiredOutputString(entry, "firstMessage"),
		modifiedAt: parseRequiredOutputNumber(entry, "modifiedAt"),
		...(lastMessagePreview === undefined ? {} : { lastMessagePreview }),
		...(parentSessionPath === undefined ? {} : { parentSessionPath }),
		...(parentEntryId === undefined ? {} : { parentEntryId }),
	};
}

function parseSessionHistory(value: unknown): SessionHistoryEntry[] {
	if (!Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an array");
	}
	return value.map(parseSessionHistoryEntry);
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

export const DOMAIN_PROJECT_CAPABILITIES = {
	LIST: defineCapability<Record<string, never>, ProjectListResult>({
		id: "cap.domain.vetta.project.list",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseProjectListResult,
	}),
	CREATE: defineCapability<ProjectCreateInput, ProjectEntry>({
		id: "cap.domain.vetta.project.create",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseProjectCreateInput,
		parseOutput: parseProjectEntry,
	}),
	OPEN: defineCapability<ProjectOpenInput, ProjectEntry>({
		id: "cap.domain.vetta.project.open",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseProjectOpenInput,
		parseOutput: parseProjectEntry,
	}),
	RENAME: defineCapability<ProjectRenameInput, ProjectEntry>({
		id: "cap.domain.vetta.project.rename",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseProjectRenameInput,
		parseOutput: parseProjectEntry,
	}),
	ARCHIVE: defineCapability<ProjectPathInput, undefined>({
		id: "cap.domain.vetta.project.archive",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseProjectPathInput,
		parseOutput: parseVoidOutput,
	}),
	UNARCHIVE: defineCapability<ProjectPathInput, undefined>({
		id: "cap.domain.vetta.project.unarchive",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseProjectPathInput,
		parseOutput: parseVoidOutput,
	}),
	REMOVE: defineCapability<ProjectPathInput, undefined>({
		id: "cap.domain.vetta.project.remove",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseProjectPathInput,
		parseOutput: parseVoidOutput,
	}),
} as const;

export const DOMAIN_SESSION_CAPABILITIES = {
	LIST: defineCapability<SessionListInput, SessionHistoryEntry[]>({
		id: "cap.domain.vetta.session.list",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseSessionListInput,
		parseOutput: parseSessionHistory,
	}),
	LIST_RUNTIME_PROJECTS: defineCapability<Record<string, never>, SessionRuntimeProject[]>({
		id: "cap.domain.vetta.session.runtime-project.list",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseSessionRuntimeProjects,
	}),
} as const;

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
